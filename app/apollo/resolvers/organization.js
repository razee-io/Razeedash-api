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
const { validAuth } = require ('./common');

const organizationResolvers = {
  Query: {

    registrationUrl: async (parent, { org_id }, { models, me, req_id, logger}) => {
      const queryName = 'registrationUrl';
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.RESOURCE, models, queryName, req_id, logger);

      const url = await models.Organization.getRegistrationUrl(org_id, {models, me, req_id, logger});
      return url;
    },

    organizations: async (parent, args, { models, me, req_id, logger }) => {
      return models.User.getOrgs(models, me, req_id, logger);
    },
  },
};

module.exports = organizationResolvers;
