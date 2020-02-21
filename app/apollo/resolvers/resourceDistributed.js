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

const buildSearchForResources = require('../utils');
const { ACTIONS, TYPES } = require('../models/const');

const commonResourcesDistributedSearch = async (
  models,
  searchFilter,
  limit,
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
    logger.error(error, 'commonResourcesDistributedSearch encountered an error');
    throw error;
  }
  return results;
};

const whoIs = me => {
  if (me === null || me === undefined) return 'null';
  if (me.email) return me.email;
  return me._id;
};

// Validate is user is authorized for the requested action.
// Throw exception if not.
const validAuth = async (
  me,
  org_id,
  action,
  type,
  models,
  queryName,
  logger,
) => {
  if (
    me === null ||
    !(await models.User.isAuthorized(me, org_id, action, type))
  ) {
    logger.error(
      `AuthenticationError - ${queryName}, user:${whoIs(me)}, org_id:${org_id}, action:${action}, Type:${type}`,
    );
    throw new AuthenticationError(
      `You are not allowed to access resources under this organization for the query ${queryName}.`,
    );
  }
};

const resourceDistributedResolvers = {
  Query: {
    resourcesDistributedCount: async (
      parent,
      { org_id },
      { models, me, logger, req_id },
    ) => {
      const queryName = 'resourcesDistributedCount';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);

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
      return result;
    },

    resourcesDistributed: async (
      parent,
      { org_id, filter, fromDate, toDate, limit },
      { models, me, logger, req_id },
    ) => {
      const queryName = 'resourcesDistributed';
      logger.debug( {req_id, user: whoIs(me), org_id, filter, fromDate, toDate, limit }, `${queryName} enter`);

      if (limit < 0) limit = 20;
      if (limit > 50) limit = 50;

      let searchFilter = { org_id: me.org_id, deleted: false };
      if ((filter && filter !== '') || fromDate != null || toDate != null) {
        searchFilter = buildSearchForResources(
          searchFilter,
          filter,
          fromDate,
          toDate,
        );
      }
      return commonResourcesDistributedSearch(
        models,
        searchFilter,
        limit,
        logger,
      );
    },

    resourcesDistributedByCluster: async (
      parent,
      { org_id, cluster_id, filter, limit },
      { models, me, logger, req_id },
    ) => {
      const queryName = 'resourcesDistributedByCluster';
      logger.debug( {req_id, user: whoIs(me), org_id, filter, limit }, `${queryName} enter`);

      if (limit < 0) limit = 20;
      if (limit > 50) limit = 50;
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);

      let searchFilter = {
        org_id: me.org_id,
        cluster_id: cluster_id,
        deleted: false,
      };
      if (filter && filter !== '') {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      return commonResourcesDistributedSearch(
        models,
        searchFilter,
        limit,
        logger,
      );
    },

    resourceDistributed: async (parent, { _id }, { models, me, logger, req_id }) => {
      const queryName = 'resourceDistributed';
      logger.debug( {req_id, user: whoIs(me), _id }, `${queryName} enter`);
      // eslint-disable-next-line no-restricted-syntax
      for (const rd of models.ResourceDistributed) {
        // eslint-disable-next-line no-await-in-loop
        let result = await rd.findById(_id).lean();
        if (result !== null) {
          // eslint-disable-next-line no-await-in-loop
          await validAuth(me, result.org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);
          return result;
        }
      }
      return null;
    },

    resourceDistributedByKeys: async (
      parent,
      { org_id, cluster_id, selfLink },
      { models, me, logger, req_id },
    ) => {
      const queryName = 'resourceDistributedByKeys';
      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, selfLink}, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);
      // eslint-disable-next-line no-restricted-syntax
      for (const rd of models.ResourceDistributed) {
        // eslint-disable-next-line no-await-in-loop
        let result = await rd.findOne({ org_id, cluster_id, selfLink }).lean();
        if (result !== null) {
          return result;
        }
      }
      return null;
    },
  },
};

module.exports = resourceDistributedResolvers;
