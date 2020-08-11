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

const { whoIs } = require ('./common');

const organizationResolvers = {
  Query: {

    organizations: async (parent, args, context) => {
      const queryName = 'organizations';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, args, me: whoIs(me) }, `${queryName} enter`);
      return models.User.getOrgs(context);
    },
  },
};

module.exports = organizationResolvers;
