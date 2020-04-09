/**
 * Copyright 2020 IBM Corp. All Rights Reserved.
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

const http = require('http');
const express = require('express');
const router = express.Router();
const ebl = require('express-bunyan-logger');
const bunyan = require('bunyan');
const { ApolloServer } = require('apollo-server-express');
const addRequestId = require('express-request-id')();

const { getBunyanConfig } = require('./utils/bunyan');
const { AUTH_MODEL, GRAPHQL_PATH } = require('./models/const');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { models, connectDb, setupDistributedCollections, closeDistributedConnections } = require('./models');
const bunyanConfig = getBunyanConfig('apollo');
const logger = bunyan.createLogger(bunyanConfig);

const initModule = require(`./init.${AUTH_MODEL}`);

const createDefaultApp = () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(addRequestId);
  app.use(function errorHandler(err, req, res, next) {
    if (err) {
      if (req.log && req.log.error) req.log.error(err);
      else logger.error(err);
      if (!res.headersSent) {
        const statusCode = err.statusCode || 500;
        return res.status(statusCode).send();
      }
      return next(err);
    }
    return next();
  });
  return app;
};

const buildCommonApolloContext = async ({ models, req, res, connection, logger }) => {
  let context = await initModule.buildApolloContext({
    models,
    req,
    res,
    connection,
    logger,
  });
  // populate req and req_id to apollo context
  if (connection) {
    const upgradeReq = connection.context.upgradeReq;
    context = { req: upgradeReq, req_id: upgradeReq ? upgradeReq.id : undefined, ...context};
  } else if (req) {
    context = { req, req_id: req.id, ...context};
  } 
  return context;
};

const createApolloServer = () => {
  const server = new ApolloServer({
    introspection: true,
    playground: process.env.NODE_ENV !== 'production',
    typeDefs,
    resolvers,
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
        connection,
        logger,
      });
    },
    subscriptions: {
      path: GRAPHQL_PATH,
      onConnect: async (connectionParams, webSocket, context) => {
        const req_id = webSocket.upgradeReq.id;
        logger.trace({ req_id, connectionParams, context }, 'subscriptions:onConnect');
        const me = await models.User.getMeFromConnectionParams(
          connectionParams,
          {req_id, models, logger, ...context},
        );
        logger.debug({ me }, 'subscriptions:onConnect upgradeReq getMe');
        if (me === undefined) {
          throw Error(
            'Can not find the session for this subscription request.',
          );
        }
        // add original upgrade request to the context 
        return { me, upgradeReq: webSocket.upgradeReq, logger };
      },
      onDisconnect: (webSocket, context) => {
        logger.debug(
          { req_id: webSocket.upgradeReq.id, headers: context.request.headers },
          'subscriptions:onDisconnect upgradeReq getMe',
        );
      },
    },
  });
  return server;
};

const stop = async (apollo) => {
  await apollo.db.connection.close();
  await closeDistributedConnections();
  await apollo.server.stop();
  await apollo.httpServer.close(() => {
    console.log('🏄 Apollo Server closed.');
  });
};

const apollo = async (options = {}) => {

  if (!process.env.AUTH_MODEL) {
    logger.error('apollo server is enabled, however AUTH_MODEL is not defined.');
    process.exit(1);
  }

  try {
    const db = await connectDb(options.mongo_url);
    const mongoUrls =
      options.mongo_urls ||
      process.env.MONGO_URLS ||
      options.mongo_url ||
      process.env.MONGO_URL ||
      'mongodb://localhost:3001/meteor';
    await setupDistributedCollections(mongoUrls);

    const app = options.app ? options.app : createDefaultApp();
    router.use(ebl(getBunyanConfig('apollo')));
    app.use(GRAPHQL_PATH, router);
    initModule.initApp(app, models, logger);

    const server = createApolloServer();
    server.applyMiddleware({ app, path: GRAPHQL_PATH });

    const httpServer = options.httpServer ? options.httpServer : http.createServer(app);
    server.installSubscriptionHandlers(httpServer);
    httpServer.on('listening', () => {
      const addrHost = httpServer.address().address;
      const addrPort = httpServer.address().port;
      logger.info(
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
    logger.error(err, 'Apollo api error');
    process.exit(1);
  }
};

module.exports = apollo;
