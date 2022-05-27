/**
 * Copyright 2020, 2021 IBM Corp. All Rights Reserved.
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

//PLC
const { execute, subscribe } = require( 'graphql' );
const { SubscriptionServer } = require( 'subscriptions-transport-ws' );
const { makeExecutableSchema } = require( '@graphql-tools/schema' );
let subscriptionServer;
const GraphQLUpload = require('graphql-upload/GraphQLUpload.js');
const graphqlUploadExpress = require('graphql-upload/graphqlUploadExpress.js');
//PLC

const http = require('http');
const express = require('express');
const router = express.Router();
const { ApolloServer } = require('apollo-server-express');
const addRequestId = require('express-request-id')();
const { IdentifierDirective, JsonDirective } = require('./utils/directives');
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

const buildCommonApolloContext = async ({ models, req, res, connection }) => {
  if (connection) { // Operation is a Subscription
    const logger = connection.context.logger;
    const req_id = connection.context.logger.fields.req_id;
    const req = connection.context.upgradeReq;
    const apiKey = connection.context.orgKey;
    const userToken = connection.context.userToken;
    const orgId = connection.context.orgId;
    const context = await initModule.buildApolloContext({ models, req, res, connection, logger });
    return { apiKey, req, req_id, userToken, recoveryHintsMap, orgId, ...context };
  } else if (req) { // Operation is a Query/Mutation
    const logger = req.log; // request context logger created by express-bunyan-logger
    const context = await initModule.buildApolloContext({ models, req, res, connection, logger });
    if (context.me && context.me.orgKey) {
      const org = await models.Organization.findOne({ orgKeys: context.me.orgKey });
      logger.fields.org_id = org._id;
    }
    if (context.me && context.me.org_id) {
      logger.fields.org_id = context.me.org_id;
    }
    return { req, req_id: logger.fields.req_id, recoveryHintsMap, ...context }; // req_id = req.id
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

const createApolloServer = (schema /*PLC*/) => {
  const customPlugins = loadCustomPlugins();

  //PLC
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

  initLogger.info(customPlugins, 'Apollo server custom plugin are loaded.');
  const server = new ApolloServer({
    introspection: true, // set to true as long as user has valid token
    plugins: customPlugins,
    //PLC tracing: process.env.GRAPHQL_ENABLE_TRACING === 'true',
    //PLC playground: process.env.GRAPHQL_ENABLE_PLAYGROUND === 'true',
    //PLC typeDefs,
    //PLC resolvers,
    schema,
    //PLC FIXME schemaDirectives is no longer supported?
    /*
    schemaDirectives: {
      sv: IdentifierDirective,
      jv: JsonDirective,
    },
    */
    //PLC FIXME CSRF protection needs to be assessed
    formatError: error => {
      // remove the internal sequelize error message
      // leave only the important validation error
      const message = error.message
        .replace('SequelizeValidationError: ', '')
        .replace('Validation error: ', '');
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
        connection
      });
    },
    /*
    PLC
    subscriptions: {
      path: GRAPHQL_PATH,
      keepAlive: 10000,
      onConnect: async (connectionParams, webSocket, context) => { // eslint-disable-line no-unused-vars
        let orgKey, orgId;
        if(connectionParams.headers && connectionParams.headers['razee-org-key']) {
          orgKey = connectionParams.headers['razee-org-key'];
          const org = await models.Organization.findOne({ orgKeys: orgKey });
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
        return { me, upgradeReq: webSocket.upgradeReq, logger, orgKey, orgId };
      },
      onDisconnect: (webSocket, context) => {
        initLogger.debug(
          { headers: context.request.headers },
          'subscriptions:onDisconnect upgradeReq getMe',
        );
      },
    },
    */
  });
  return server;
};

//PLC
const createSubscriptionServer = (httpServer, apolloServer, schema) => {
  return SubscriptionServer.create(
    {
      // This is the `schema` we just created.
      schema,
      // These are imported from `graphql`.
      execute,
      subscribe,
      // Providing `onConnect` is the `SubscriptionServer` equivalent to the
      // `context` function in `ApolloServer`. Please [see the docs](https://github.com/apollographql/subscriptions-transport-ws#constructoroptions-socketoptions--socketserver)
      // for more information on this hook.
      onConnect: async (connectionParams, webSocket, context) => { // eslint-disable-line no-unused-vars
        let orgKey, orgId;
        if(connectionParams.headers && connectionParams.headers['razee-org-key']) {
          orgKey = connectionParams.headers['razee-org-key'];
          const org = await models.Organization.findOne({ orgKeys: orgKey });
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
        return { me, upgradeReq: webSocket.upgradeReq, logger, orgKey, orgId };
      },
    },
    {
      // `httpServer` is the instance returned from `http.createServer`.
      server: httpServer,
      // `apolloServer` is the instance returned from `new ApolloServer`.
      path: apolloServer.graphqlPath,
    }
  );
}


const stop = async (apollo) => {
  await apollo.db.connection.close();
  await apollo.server.stop();
  await apollo.httpServer.close(() => {
    console.log('🏄 Apollo Server closed.');
  });
};

const apollo = async (options = {}) => {

  try {
    const db = await connectDb(options.mongo_url);
    const app = options.app ? options.app : createDefaultApp();
    app.use(createExpressLogger('razeedash-api/apollo'));
    if (initModule.playgroundAuth && process.env.GRAPHQL_ENABLE_PLAYGROUND === 'true') {
      initLogger.info('Enabled playground route with authorization enforcement.');
      app.get(GRAPHQL_PATH, initModule.playgroundAuth);
    }
    app.use(GRAPHQL_PATH, router);
    initModule.initApp(app, models, initLogger);

    //PLC
    resolvers.Upload = GraphQLUpload;
    //PLC
    const schema = makeExecutableSchema({ typeDefs, resolvers });

    const server = createApolloServer(schema);

    //PLC - may not jive with subscriptionserver?
    await server.start();

    //PLC
    // This middleware should be added before calling `applyMiddleware`.
    app.use(graphqlUploadExpress());

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

    //PLC
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
