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
const promClient = require('../../prom-client');


const organizationResolvers = {
  Query: {

    registrationUrl: async (parent, { org_id }, { models, me, req_id, logger}) => {
      //Get api requests latency & queue metrics
      promClient.queRegUrl.inc();
      const end = promClient.respRegUrl.startTimer();
      const queryName = 'registrationUrl';
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.RESOURCE, models, queryName, req_id, logger);

      const org = await models.Organization.findById(org_id);

      if(org){ end({ StatusCode: '200' }) };   //stop the response time timer, and report the metric
      promClient.queRegUrl.dec();
      if (process.env.EXTERNAL_URL) {
        return {
          url: `${process.env.EXTERNAL_URL}/api/install/cluster?orgKey=${org.orgKeys[0]}`,
        };
      }
      return {
        url: `http://localhost:3333/api/install/cluster?orgKey=${org.orgKeys[0]}`,
      };
    },

    organizations: async (parent, args, { models, me, req_id, logger }) => {
      //Get api requests latency & queue metrics
      promClient.queOrgs.inc();
      const end = promClient.respOrgs.startTimer();
      const response = await models.User.getOrgs(models, me, req_id, logger);

      if(response){ end({ StatusCode: '200' }) };   //stop the response time timer, and report the metric
      promClient.queOrgs.dec();

      return response;

    },
  },
};

module.exports = organizationResolvers;
