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

const bcrypt=require('bcrypt');
const passport=require('passport');
const GraphQLLocalStrategy=require('graphql-passport').GraphQLLocalStrategy;
const buildContext=require('graphql-passport').buildContext;
const { SECRET,  GRAPHQL_PATH} = require('./models/const');


const initApp = (app, models, logger) => {
  logger.info('initialize apollo application for passport local auth');
  passport.use(
    new GraphQLLocalStrategy(async function(email, password, done) {
      const matchingUser = await models.User.find({
        'services.passportlocal.email': email,
      });
      let error = matchingUser[0] ? null : new Error('No matching user');
      if (matchingUser[0]) {
        const validPass = await bcrypt.compare(
          password,
          matchingUser[0].services.passportlocal.password,
        );
        error = validPass ? null : new Error('Password didn\'t match');
        done(error, matchingUser[0]);
      }
      done(error);
    }),
  );
  app.use(GRAPHQL_PATH, passport.initialize());
};

const buildApolloContext = async ({models, req, res, connection, logger}) => {
  if (connection) {
    logger.debug({ connection }, 'context websocket connection is');
    return buildContext({
      req,
      res,
      models,
      me: connection.context.me,
      logger,
    });
  }
  if (req) {
    const me = await models.User.getMeFromRequest(req, {models, req_id: req.id, logger});
    return buildContext({
      req,
      res,
      models,
      me,
      secret: SECRET,
      logger,
    });
  }
  return buildContext({ req, res, me: {}, logger, models });
};

module.exports = { initApp,  buildApolloContext };