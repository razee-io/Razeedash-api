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

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');

const organizationResolvers = {
  Query: {

    registrationUrl: async (parent, { org_id }, context) => {
      const queryName = 'registrationUrl';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, org_id}, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.CREATE, TYPES.ORGANIZATION, queryName, context);

      const url = await models.Organization.getRegistrationUrl(org_id, context);
      return url;
    },

    organizations: async (parent, args, context) => {
      const queryName = 'organizations';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, args, me: whoIs(me) }, `${queryName} enter`);
      return models.User.getOrgs(context);
    },

    organization: async (parent, args, context) => {
      const queryName = 'organization';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, args, me: whoIs(me) }, `${queryName} enter`);
      return models.User.getOrg(models, me);
    },
  },
};

module.exports = organizationResolvers;
