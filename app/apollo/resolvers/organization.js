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

const { AuthenticationError } = require('apollo-server');
const { ACTIONS, TYPES } = require('../models/const');

const organizationResolvers = {
  Query: {
    registrationUrl: async (parent, { org_id }, { models, me }) => {
      const isPermitted = await models.User.isAuthorized(
        me,
        org_id,
        ACTIONS.MANAGE,
        TYPES.RESOURCE,
      );
      if (isPermitted) {
        const org = await models.Organization.findById(org_id);
        if (process.env.EXTERNAL_URL) {
          return {
            url: `${process.env.EXTERNAL_URL}/api/install/cluster?orgKey=${org.orgKeys[0]}`,
          };
        }
        return {
          url: `http://localhost:3333/api/install/cluster?orgKey=${org.orgKeys[0]}`,
        };
      }
      throw new AuthenticationError('You are not permitted to visit this api.');
    },
    organizations: async (parent, args, { models, me }) => {
      return models.User.getOrgs(models, me);
    },
  },
};

module.exports = organizationResolvers;
