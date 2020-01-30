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

const lodash = require('lodash');
const Moment = require('moment');
const { AuthenticationError } = require('apollo-server');
const { ACTIONS, TYPES } = require('../models/const');

const buildSearchForClusterName = (ordId, searchStr) => {
  const tokens = searchStr.split(/\s+/);
  const ands = lodash.map(tokens, token => {
    const searchRegex = { $regex: token, $options: 'i' };
    const ors = [{ cluster_id: searchRegex }];
    const out = {
      $or: ors,
    };
    return out;
  });

  ands.push({
    org_id: ordId,
  });

  const search = {
    $and: ands,
  };
  return search;
};

// Validate is user is authorized for the requested action.
// Throw excpetion if not.
const validAuth = async (me, orgId, action, models, queryName, logger) => {
  if (!(await models.User.isAuthorized(me, orgId, action, TYPES.CLUSTER))) {
    logger.error(
      `Authentication error - ${queryName}, username: ${me.username}, org_id: ${orgId}, action: Read, Type: Cluster`,
    );
    throw new AuthenticationError(
      'You are not allowed to access resources for this organization.',
    );
  }
};

// Common search function that handles multiple DBs
const commonClusterDistributedSearch = async (
  models,
  searchFilter,
  limit,
  logger,
  queryName,
) => {
  const results = [];
  let resultsArray = [];

  try {
    resultsArray = await Promise.all(
      models.ClusterDistributed.map(cd => {
        return cd
          .find(searchFilter)
          .sort({ created: -1 })
          .limit(limit);
      }),
    );
    resultsArray.map(resultSet => {
      return resultSet.map(result => {
        return results.push(result.toJSON());
      });
    });
  } catch (error) {
    logger.error(
      `${queryName} commonClusterDistributedSearch encountered an error ${error.stack}`,
    );
    throw error;
  }

  return results;
};

const clusterDistributedResolvers = {
  Query: {
    clusterDistributedByClusterID: async (
      parent,
      { org_id: orgId, cluster_id: clusterId },
      { models, me, logger },
    ) => {
      const queryName = 'clusterDistributedByClusterID';
      logger.debug(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, clusterId: ${clusterId}`,
      );

      await validAuth(me, orgId, ACTIONS.READ, models, queryName, logger);

      // We do not need a Promise.all here becuase the record can live in only one DB.
      // If we find it in the first DB, return the results, otherwise query the 2nd DB.
      // eslint-disable-next-line no-restricted-syntax
      for (const cd of models.ClusterDistributed) {
        // eslint-disable-next-line no-await-in-loop
        const result = await cd.findOne({
          org_id: orgId,
          cluster_id: clusterId,
        });

        if (result != null) {
          return result.toJSON();
        }
      }
      return null;
    }, // end clusterDistributedByClusterID

    clustersDistributedByOrgID: async (
      parent,
      { org_id: orgId, limit },
      { models, me, logger },
    ) => {
      const queryName = 'clustersDistributedByOrgID';
      logger.debug(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, limit: ${limit}`,
      );
      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, models, queryName, logger);

      return commonClusterDistributedSearch(
        models,
        { org_id: orgId },
        limit,
        logger,
        queryName,
      );
    }, // end clustersDistributedByOrgID

    // Find all the clusters that have not been updated in the last day
    clusterDistributedZombies: async (
      parent,
      { org_id: orgId, limit },
      { models, me, logger },
    ) => {
      const queryName = 'clusterDistributedZombies';
      logger.debug(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, limit: ${limit}`,
      );

      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, models, queryName, logger);

      const searchFilter = {
        org_id: orgId,
        updated: {
          $lt: new Moment().subtract(1, 'day').toDate(),
        },
      };
      return commonClusterDistributedSearch(
        models,
        searchFilter,
        limit,
        logger,
        queryName,
      );
    }, // end clusterDistributedZombiess

    clusterDistributedSearch: async (
      parent,
      { org_id: orgId, filter, limit = 50 },
      { models, me, logger },
    ) => {
      const queryName = 'clusterDistributedSearch';
      logger.debug(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, filter: ${filter}`,
      );
      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, models, queryName, logger);

      // If no filter provide, just query based on orig id
      if (!filter) {
        return commonClusterDistributedSearch(
          models,
          { org_id: orgId },
          limit,
          logger,
          queryName,
        );
      }

      // Filter provided, build the search filter and query
      const searchFilter = buildSearchForClusterName(orgId, filter);
      return commonClusterDistributedSearch(
        models,
        searchFilter,
        limit,
        logger,
        queryName,
      );
    }, // end clusterDistributedSearch

    // Summarize the number clusters by version for active clusters.
    // Active means the cluster information has been updated in the last day
    clusterDistributedCountByKubeVersion: async (
      parent,
      { org_id: orgId },
      { models, me, logger },
    ) => {
      const queryName = 'clusterDistributedCountByKubeVersion';
      // logger.debug(`${queryName}: username: ${me.username}, orgID: ${orgId}`);
      logger.debug(`${queryName}: username: ${me.username}, orgID: ${orgId}`);

      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, models, queryName, logger);

      let resultsArray = [];

      try {
        resultsArray = await Promise.all(
          models.ClusterDistributed.map(cd => {
            return cd.aggregate([
              {
                $match: {
                  org_id: orgId,
                  updated: {
                    $gte: new Moment().subtract(1, 'day').toDate(),
                  },
                },
              },
              {
                $group: {
                  _id: {
                    major: '$metadata.kube_version.major',
                    minor: '$metadata.kube_version.minor',
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ]);
          }),
        );
      } catch (error) {
        logger.error(
          `${queryName} clusterDistributedCountByKubeVersion encountered an error ${error.stack}`,
        );
        throw error;
      }

      const totalResults = resultsArray[0];

      // eslint-disable-next-line no-restricted-syntax
      for (const newItem of resultsArray[1]) {
        // If newItem found in totalResults, add the count of newItem
        // to the count in totalResults. Else add the newItem to totalResults
        const index = totalResults.findIndex(item => {
          logger.debug(`item: ${JSON.stringify(item, null, 4)}`);
          return (
            item._id.minor === newItem._id.minor &&
            item._id.major === newItem._id.major
          );
        });

        if (index >= 0) {
          totalResults[index].count += newItem.count;
        } else {
          totalResults.push(newItem);
        }
      }
      logger.debug(`totalResults: ${JSON.stringify(totalResults, null, 4)}`);
      return totalResults;
    }, // end clusterDistributedCountByKubeVersion
  }, // end query
}; // end default

module.exports = clusterDistributedResolvers;
