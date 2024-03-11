/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { execute, subscribe, parse } = require( 'graphql' );
const { SubscriptionServer } = require( 'subscriptions-transport-ws' );
const { makeExecutableSchema } = require( '@graphql-tools/schema' );
let subscriptionServer;
const GraphQLUpload = require('graphql-upload/GraphQLUpload.js');
const graphqlUploadExpress = require('graphql-upload/graphqlUploadExpress.js');

const http = require('http');
const express = require('express');
const router = express.Router();
const { ApolloServer } = require('apollo-server-express');
const addRequestId = require('express-request-id')();
const { createLogger, createExpressLogger } = require('../log');
const initLogger = createLogger('razeedash-api/app/apollo/index');
const { AUTH_MODEL, GRAPHQL_PATH } = require('./models/const');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const recoveryHintsMap = require('./resolvers/recoveryHintsMap');
const { models, connectDb } = require('./models');
const promClient = require('prom-client');
const createMetricsPlugin = require('apollo-metrics');
const apolloMetricsPlugin = createMetricsPlugin(promClient.register);
const { customMetricsClient } = require('../customMetricsClient'); // Add custom metrics plugin
const apolloMaintenancePlugin = require('./maintenance/maintenanceModePlugin.js');
const { GraphqlPubSub } = require('./subscription');

// If external auth model specified, use it.  Else use built-in auth model.
const externalAuthModels = require('../externalAuth.js').ExternalAuthModels;
const initModule = externalAuthModels[AUTH_MODEL] ? require(externalAuthModels[AUTH_MODEL].initPath) : require(`./init.${AUTH_MODEL}`);

const conf = require('../conf.js').conf;
const { v4: uuid } = require('uuid');
const pubSub = GraphqlPubSub.getInstance();

const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const i18nextBackend = require('i18next-fs-backend');
i18next.use(i18nextBackend).use(i18nextMiddleware.LanguageDetector).init({
  //debug: true,
  backend: {
    loadPath: './locales/{{lng}}/razee-resources.json'
  },
  fallbackLng: 'en',
  supportedLngs:['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt-br', 'zh-cn', 'zh-tw'],
  load: 'languageOnly',
  saveMissing: false,
  initImmediate: true,
  nsSeparator: '#||#',
  keySeparator: '#|#'
});

const createDefaultApp = () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(addRequestId);
  app.use(i18nextMiddleware.handle(i18next));
  return app;
};

const buildCommonApolloContext = async ({ models, req, res, connection, req_id }) => {
  if (connection) { // Operation is a Subscription
    const logger = connection.context.logger;
    const req = connection.context.upgradeReq;
    const apiKey = connection.context.orgKey;
    const userToken = connection.context.userToken;
    const orgId = connection.context.orgId;
    const context = await initModule.buildApolloContext({ models, req, res, connection, logger });
    return { apiKey, req, req_id, userToken, recoveryHintsMap, orgId, ...context };
  } else if (req) { // Operation is a Query/Mutation
    const logger = req.log;
    const context = await initModule.buildApolloContext({ models, req, res, connection, logger });
    if (context.me && context.me.orgKey) {
      const org = await models.Organization.findOne( { $or: [ { orgKeys: context.me.orgKey }, { 'orgKeys2.key': context.me.orgKey } ] } );
      req.log = req.log.child({org_id: org._id});
    }
    if (context.me && context.me.org_id) {
      req.log = req.log.child({org_id: context.me.org_id});
    }
    return { req, req_id, recoveryHintsMap, ...context };
  }
};

const loadCustomPlugins =  () => {
  if (process.env.GRAPHQL_CUSTOM_PLUGINS) {
    try {
      const pluginStrs = process.env.GRAPHQL_CUSTOM_PLUGINS.split(';');
      return pluginStrs.map( str => {
        initLogger.info('Loading custom plugin: ' + str);
        return require(str);
      });
    } catch (err) {
      initLogger.error(err, 'Error encountered when loading custom plugin.');
      process.exit(1);
    }
  }
  return [];
};

var SIGTERM = false;
process.on('SIGTERM', () => SIGTERM = true);

const createApolloServer = (schema) => {
  const customPlugins = loadCustomPlugins();

  customPlugins.push({
    async serverWillStart() {
      return {
        async drainServer() {
          subscriptionServer.close();
        }
      };
    }
  });

  if (process.env.GRAPHQL_ENABLE_TRACING === 'true') {
    initLogger.info('Adding metrics plugin: apollo-metrics');
    customPlugins.push(apolloMetricsPlugin);
  }
  if(conf.maintenance.flag && conf.maintenance.key) {
    initLogger.info('Adding graphql plugin apolloMaintenancePlugin to disable all mutations');
    customPlugins.push(apolloMaintenancePlugin);
  }

  customPlugins.push({
    // Populate API metrics as they occur
    requestDidStart(context) {
      // Capture the start time when the request starts
      const startTime = Date.now();

      // Increment API counter metric
      customMetricsClient.apiCallsCount.inc();

      let encounteredError = false;
      return {
        didResolveOperation() {
          // Parse API operation name
          const match = context.request.query.match(/\{\s*(\w+)/);
          const operationName = match ? match[1] : 'Query name not found';
          // Record API operation duration metrics
          const durationInSeconds = (Date.now() - startTime) / 1000;
          customMetricsClient.apiCallHistogram(operationName).observe(durationInSeconds);
        },
        didEncounterErrors() {
          encounteredError = true;
        },
        willSendResponse() {
          // Parse API operation name
          const match = context.request.query.match(/\{\s*(\w+)/);
          const operationName = match ? match[1] : 'Query name not found';
          // Record API operation success and failure gauge metrics
          if (encounteredError) {
            customMetricsClient.apiCallCounter(operationName).inc({ status: 'failure' });
          } else {
            customMetricsClient.apiCallCounter(operationName).inc({ status: 'success' });
          }
        }
      };
    },
  });

  initLogger.info(customPlugins, 'Apollo server custom plugin are loaded.');

  const server = new ApolloServer({
    introspection: true, // set to true as long as user has valid token
    plugins: customPlugins,
    schema,
    allowBatchedHttpRequests: (process.env.GRAPHQL_DISABLE_BATCHING ? false : true),
    formatError: error => {
      // remove the internal sequelize error message
      // leave only the important validation error
      const message = error.message
        .replace('SequelizeValidationError: ', '')
        .replace('Validation error: ', '')
        .split(' Did you mean')[0];
      return {
        ...error,
        message,
      };
    },
    context: async ({ req, res, connection }) => {
      return buildCommonApolloContext({
        models,
        req,
        res,
        connection,
        req_id: uuid()
      });
    },
  });
  return server;
};

const createSubscriptionServer = (httpServer, apolloServer, schema) => {
  return SubscriptionServer.create( // SubscriptionServer from subscriptions-transport-ws
    {
      // This is the `schema` we just created.
      schema,
      // These are imported from `graphql`.
      execute,
      subscribe,
      keepAlive: 10000,
      // Providing `onConnect` is the `SubscriptionServer` equivalent to the
      // `context` function in `ApolloServer`. Please [see the docs](https://github.com/apollographql/subscriptions-transport-ws#constructoroptions-socketoptions--socketserver)
      // for more information on this hook.
      onConnect: async (connectionParams, webSocket, context) => { // eslint-disable-line no-unused-vars
        let orgKey, orgId;
        if(connectionParams.headers && connectionParams.headers['razee-org-key']) {
          orgKey = connectionParams.headers['razee-org-key'];
          const org = await models.Organization.findOne( { $or: [ { orgKeys: orgKey }, { 'orgKeys2.key': orgKey } ] } );
          orgId = org._id;
        }
        const req_id = uuid();
        const logger  = createLogger('razeedash-api/app/apollo/subscription', { req_id, org_id: orgId });

        logger.debug('subscriptions:onConnect upgradeReq getMe');

        const me = await models.User.getMeFromConnectionParams( connectionParams, {req_id, logger},);
        if (me === undefined) {
          throw Error(
            'Can not find the session for this subscription request.',
          );
        }
        // add original upgrade request to the context
        const subscriptionContext = { me, upgradeReq: webSocket.upgradeReq, logger, orgKey, orgId };
        return await buildCommonApolloContext( { models, req: context.request, res: { this_is_a_dummy_response: true }, connection: { context: subscriptionContext }, req_id } );
      },
    },
    {
      // `httpServer` is the instance returned from `http.createServer`.
      server: httpServer,
      // `apolloServer` is the instance returned from `new ApolloServer`.
      path: apolloServer.graphqlPath,
    }
  );
};

// Clean exit is necessary for unit tests, so that one set of tests does not prevent creating a new database connection in the next set of tests for example.
const stop = async (apollo) => {
  try {
    let t;
    console.log( `🚣 Stopping, time: ${Date.now()}` );
    console.log( `connection.readyState: ${apollo.db.connection.readyState}` );
    console.log( `connections: ${apollo.db.connections.length}` );
    t = Date.now();
    try {
      console.log( `🚣 Closing default connection, time: ${Date.now()}` );
      await apollo.db.connection.close(true);
    }
    catch(e){
      console.log( `🏊 Error closing default connection, time: ${Date.now()}, error: ${e.message}` );
    }
    console.log( `🚣 Disconnecting database, time: ${Date.now()}` );
    await apollo.db.disconnect();
    console.log( `final connection.readyState: ${apollo.db.connection.readyState}` );
    console.log( `Database disconnected in ${Date.now()-t} ms, time: ${Date.now()}` );

    console.log( '🚣 Stopping apollo server' );
    t = Date.now();
    await apollo.server.stop(); // stopgGracePeriodMillis defaults to 10 seconds
    console.log( `Apollo server stopped in ${Date.now()-t} ms, time: ${Date.now()}` );

    console.log('🚣 Closing httpserver.');
    t = Date.now();
    await apollo.httpServer.close(() => {
      console.log( `🏄 Apollo Server closed, time: ${Date.now()}` );
    });
    console.log( `Apollo httpServer closed in ${Date.now()-t} ms, time: ${Date.now()}` );
  }
  catch( e ) {
    console.log( `🏊 Error during stop: ${e.message}, time: ${Date.now()}` );
    throw e;
  }
};

const apollo = async (options = {}) => {

  try {
    const db = await connectDb(options.mongo_url);
    for( const model of [ 'Cluster', 'Channel', 'DeployableVersion', 'Group', 'Subscription' ] ) {
      try {
        const indices = await models[model].collection.getIndexes({full: true});
        initLogger.info( indices, `db ${model} indices` );
      }
      catch(e) {
        initLogger.error( e, `db ${model} indices retrieval error` );
      }
    }

    const app = options.app ? options.app : createDefaultApp();
    app.use(createExpressLogger('razeedash-api/apollo'));
    if (initModule.playgroundAuth && process.env.GRAPHQL_ENABLE_PLAYGROUND === 'true') {
      initLogger.info('Enabled playground route with authorization enforcement.');
      app.get(GRAPHQL_PATH, initModule.playgroundAuth);
    }
    app.use(GRAPHQL_PATH, router);
    initModule.initApp(app, models, initLogger);

    resolvers.Upload = GraphQLUpload;

    const schema = makeExecutableSchema({ typeDefs, resolvers });

    /*
    Notes:
    As noted in https://www.apollographql.com/blog/backend/validation/graphql-validation-using-directives/ :
    > Today, people most commonly write this kind of validation logic in their resolver functions or models.
    > However, this means we can’t easily see our validation logic, and we have to write some repetitive code
    > to verify the same kinds of conditions over and over.
    The blog goes on to describe how to use Directives, but using a directive to validate arguments doesn't seem feasible at this point.
    The approach described (`graphql-constraint-directive`) works, but doesn't work with how our queries/mutations are defined,
    resulting in errors like `Variable \"$name\" of type \"String!\" used in position expecting type \"name_String_NotNull_minLength_5!\".`
    Changing the Graphql POST to be like this allows using the new type successfully with validation:
      mutation ($orgId: String!, $name: name_String_NotNull_minLength_5!, $data_location: String) { addChannel(orgId: $orgId, name: $name, [...]
    But we can't change the usage pattern to specify new types -- it would break anything using the existing API with `String!` (e.g. UI and CLI **at least**).

    Instead, we need to use explicit validation in each resolver:
        - Easiest to implement
        - Easiest to 'miss' validation
        - Does not honor `@sv` and `@jv` from the schema directly
    */

    const server = createApolloServer(schema);

    await server.start();

    // This middleware should be added before calling `applyMiddleware`.
    app.use(graphqlUploadExpress());
    //Note: there does not yet appear to be an automated test for upload, it is unclear if this even functioning.

    // Protect against batched queries of both forms described here: https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html#batching-attacks
    const GQL_BATCH_LIMIT = process.env.GRAPHQL_BATCH_LIMIT || -1;
    const countQueries = function( payload ) {
      let count = 0;
      if( Array.isArray(payload) ) {
        for( const q of payload ) {
          count += countQueries(q);
        }
      }
      else {
        const parsedQuery = parse( payload.query );
        for( let def of parsedQuery.definitions ) {
          if( def.selectionSet && def.selectionSet.selections ) count += def.selectionSet.selections.length;
        }
      }
      return( count );
    }
    app.use(GRAPHQL_PATH, (req,res,next)=>{
      // Fail if limit defined and batch greater than limit
      if( GQL_BATCH_LIMIT > 0 && countQueries( req.body ) > GQL_BATCH_LIMIT ) {
        res.status(400).send( { errors: [ { message: 'Batched query limit exceeded' } ] } );
      }
      else {
        next();
      }
    });

    server.applyMiddleware({
      app,
      cors: {origin: true},
      path: GRAPHQL_PATH,
      onHealthCheck: async () => {
        if (SIGTERM) {
          throw 'SIGTERM received. Not accepting additional requests';
        } else if (!pubSub.enabled){
          throw '!pubSub.enabled';
        } else {
          return 200;
        }
      }
    });

    const httpServer = options.httpServer ? options.httpServer : http.createServer(app);

    //server.installSubscriptionHandlers(httpServer);
    subscriptionServer = createSubscriptionServer( httpServer, server, schema );

    httpServer.on('listening', () => {
      const addrHost = httpServer.address().address;
      const addrPort = httpServer.address().port;
      initLogger.info(
        `🏄 Apollo server listening on http://[${addrHost}]:${addrPort}${GRAPHQL_PATH}`,
      );
    });

    if (!options.httpServer) {
      let port = process.env.GRAPHQL_PORT || 8000;
      if (options.graphql_port !== undefined) {
        port = options.graphql_port;
      }
      httpServer.listen({ port });
    }
    return { db, server, httpServer, stop};
  } catch (err) {
    initLogger.error(err, 'Apollo api error');
    process.exit(1);
  }
};

module.exports = apollo;
