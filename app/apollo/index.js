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
const bunyan = require('bunyan');
const { ApolloServer } = require('apollo-server-express');

const { getBunyanConfig } = require('../utils/bunyan');
const { AUTH_MODEL } = require('./models/const');

const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { models, connectDb, setupDistributedCollections } = require('./models');

const logger = bunyan.createLogger(getBunyanConfig('apollo'));

const initModule = require(`./init.${AUTH_MODEL}`);

const app = express();

if (process.env.AUTH_MODEL) {
  initModule.initApp(app, models, logger);
}

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
      return initModule.buildApolloContext({
        models,
        req,
        res,
        connection,
        logger,
      });
    },
    subscriptions: {
      path: '/graphql',
      onConnect: async (connectionParams, webSocket, context) => {
        logger.debug({ connectionParams, webSocket, context }, 'subscriptions:onConnect');
        const me = await models.User.getMeFromConnectionParams(
          connectionParams,
        );
        logger.debug({ me }, 'subscriptions:onConnect upgradeReq getMe');
        if (me === undefined) {
          throw Error(
            'Can not find the session for this subscription request.',
          );
        }
        return { me, logger };
      },
      onDisconnect: (webSocket, context) => {
        logger.debug(
          { headers: context.request.headers, webSocket },
          'subscriptions:onDisconnect upgradeReq getMe',
        );
      },
    },
  });
  server.applyMiddleware({ app, path: '/graphql' });
  return server;
};

const apollo = async (options = {}) => {
  let port = process.env.GRAPHQL_PORT || 8000;
  if (options.graphql_port !== undefined) {
    port = options.graphql_port;
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

    const server = createApolloServer();
    const httpServer = http.createServer(app);
    server.installSubscriptionHandlers(httpServer);
    httpServer.listen({ port }, () => {
      logger.info(
        `🏄  Apollo api is listening on http://localhost:${port}/graphql`,
      );
    });
    return { db, server, httpServer };
  } catch (err) {
    logger.error(`Apollo api error: ${err.stack}`);
    process.exit(1);
  }
};

module.exports = apollo;
