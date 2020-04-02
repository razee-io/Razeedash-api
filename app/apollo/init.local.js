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

const cors = require('cors');
const { SECRET } = require('./models/const');

const initApp = (app, models, logger) => {
  logger.info('Initialize apollo application for local auth');
  app.use(cors());
};

const buildApolloContext = async ({ models, req, res, connection, logger }) => {
  if (connection) {
    logger.trace({ connection, req, res }, 'context websocket connection is');
    return {
      models,
      me: connection.context.me,
      logger,
    };
  }
  if (req) {
    const me = await models.User.getMeFromRequest(req, {models, req_id: req.id, logger});
    return {
      models,
      me,
      secret: SECRET,
      logger,
    };
  }
  return { models, me: {}, logger };
};

module.exports = { initApp, buildApolloContext };