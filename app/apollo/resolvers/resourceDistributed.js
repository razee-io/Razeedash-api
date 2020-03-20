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

const buildSearchForResources = require('../utils');
const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');
const promClient = require('../../prom-client');

const commonResourcesDistributedSearch = async (
  models,
  searchFilter,
  limit,
  req_id,
  logger,
) => {
  const results = [];
  let resultsArray = [];
  try {
    resultsArray = await Promise.all(
      models.ResourceDistributed.map(rd => {
        return rd
          .find(searchFilter)
          .sort({ created: -1 })
          .limit(limit)
          .lean();
      }),
    );
    resultsArray.map(rs => {
      return rs.map(r => {
        return results.push(r);
      });
    });
  } catch (error) {
    logger.error(error, `commonResourcesDistributedSearch encountered an error for the request ${req_id}`);
    throw error;
  }
  return results;
};

const resourceDistributedResolvers = {
  Query: {
    resourcesDistributedCount: async (
      parent,
      { org_id },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queResourcesDistributedCount.inc();
      const end = promClient.respResourcesDistributedCount.startTimer();

      const queryName = 'resourcesDistributedCount';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, req_id, logger);

      let result = 0;
      let resultsArray = [];
      try {
        resultsArray = await Promise.all(
          models.ResourceDistributed.map(rd => {
            return rd.count({ org_id: org_id, deleted: false });
          }),
        );
        resultsArray.map(count => {
          result += count;
          return result;
        });
      } catch (error) {
        logger.error( {error, req_id },
          'resourcesDistributedCount encountered an error',
        );
        throw error;
      }

      if(result){ end({ StatusCode: '200' }) };   //stop the response time timer, and report the metric
      promClient.queResourcesDistributedCount.dec();
      return result;
    },

    resourcesDistributed: async (
      parent,
      { org_id, filter, fromDate, toDate, limit },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queResourcesDistributed.inc();
      const end = promClient.respResourcesDistributed.startTimer();

      const queryName = 'resourcesDistributed';
      logger.debug( {req_id, user: whoIs(me), org_id, filter, fromDate, toDate, limit }, `${queryName} enter`);

      if (limit < 0) limit = 20;
      if (limit > 50) limit = 50;
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, req_id, logger);

      let searchFilter = { org_id: me.org_id, deleted: false };
      if ((filter && filter !== '') || fromDate != null || toDate != null) {
        searchFilter = buildSearchForResources(
          searchFilter,
          filter,
          fromDate,
          toDate,
        );
      }
      result = await commonResourcesDistributedSearch(
        models,
        searchFilter,
        limit,
        req_id,
        logger,
      );

      if(result){ end({ StatusCode: '200' }) };   //stop the response time timer, and report the metric
      promClient.queResourcesDistributed.dec();
      return result;
    },

    resourcesDistributedByCluster: async (
      parent,
      { org_id, cluster_id, filter, limit },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queResourcesDistributedByCluster.inc();
      const end = promClient.respResourcesDistributedByCluster.startTimer();

      const queryName = 'resourcesDistributedByCluster';
      logger.debug( {req_id, user: whoIs(me), org_id, filter, limit }, `${queryName} enter`);

      if (limit < 0) limit = 20;
      if (limit > 50) limit = 50;
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, req_id, logger);

      let searchFilter = {
        org_id: me.org_id,
        cluster_id: cluster_id,
        deleted: false,
      };
      if (filter && filter !== '') {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      result = await commonResourcesDistributedSearch(
        models,
        searchFilter,
        limit,
        req_id,
        logger,
      );

      if(result){ end({ StatusCode: '200' }) };   //stop the response time timer, and report the metric
      promClient.queResourcesDistributedByCluster.dec();
      return result;
    },

    resourceDistributed: async (parent, { _id }, { models, me, req_id, logger }) => {
      //Get api requests latency & queue metrics
      promClient.queResourceDistributed.inc();
      const end = promClient.respResourceDistributed.startTimer();

      const queryName = 'resourceDistributed';
      logger.debug( {req_id, user: whoIs(me), _id }, `${queryName} enter`);
      // eslint-disable-next-line no-restricted-syntax
      for (const rd of models.ResourceDistributed) {
        // eslint-disable-next-line no-await-in-loop
        let result = await rd.findById(_id).lean();
        if (result !== null) {
          // eslint-disable-next-line no-await-in-loop
          await validAuth(me, result.org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, req_id, logger);

          end({ StatusCode: '200' });   //stop the response time timer, and report the metric
          promClient.queResourcesDistributedByCluster.dec();
          return result;
        }
      }
      promClient.queResourceDistributed.dec();
      return null;
    },

    resourceDistributedByKeys: async (
      parent,
      { org_id, cluster_id, selfLink },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queResourceDistributedByKeys.inc();
      const end = promClient.respResourceDistributedByKeys.startTimer();

      const queryName = 'resourceDistributedByKeys';
      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, selfLink}, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, req_id, logger);
      // eslint-disable-next-line no-restricted-syntax
      for (const rd of models.ResourceDistributed) {
        // eslint-disable-next-line no-await-in-loop
        let result = await rd.findOne({ org_id, cluster_id, selfLink }).lean();
        if (result !== null) {
          end({ StatusCode: '200' });   //stop the response time timer, and report the metric
          promClient.queResourceDistributedByKeys.dec();
          return result;
        }
      }
      promClient.queResourceDistributedByKeys.dec();
      return null;
    },
  },
};

module.exports = resourceDistributedResolvers;
