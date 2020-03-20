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

const Moment = require('moment');
const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');
const promClient = require('../../prom-client');

const buildSearchForClusterName = (ordId, searchStr) => {
  let ands = [];
  const tokens = searchStr.split(/\s+/);
  if (tokens.length > 0) {
    ands = tokens.map(token => {
      const searchRegex = { $regex: token, $options: 'i' };
      const ors = [{ cluster_id: searchRegex }];
      const out = {
        $or: ors,
      };
      return out;
    });
  }

  ands.push({
    org_id: ordId,
  });

  const search = {
    $and: ands,
  };
  return search;
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
    logger.error(error,
      `${queryName} commonClusterDistributedSearch encountered an error`,
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
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClusterDistributedByClusterID.inc();
      const end = promClient.respClusterDistributedByClusterID.startTimer();

      const queryName = 'clusterDistributedByClusterID';
      logger.debug({req_id, user: whoIs(me), orgId, clusterId}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

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
          end({ StatusCode: '200' });   //stop the response time timer, and report the metric
          promClient.queClusterDistributedByClusterID.dec();
          return result.toJSON();
        }
      }

      promClient.queClusterDistributedByClusterID.dec();
      return null;
    }, // end clusterDistributedByClusterID

    clustersDistributedByOrgID: async (
      parent,
      { org_id: orgId, limit },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClustersDistributedByOrgID.inc();
      const end = promClient.respClustersDistributedByOrgID.startTimer();

      const queryName = 'clustersDistributedByOrgID';
      logger.debug({req_id, user: whoIs(me), orgId, limit}, `${queryName} enter`);

      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const result = await commonClusterDistributedSearch(
        models,
        { org_id: orgId },
        limit,
        logger,
        queryName,
      );

      if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClustersDistributedByOrgID.dec();
      return result;
    }, // end clustersDistributedByOrgID

    // Find all the clusters that have not been updated in the last day
    clusterDistributedZombies: async (
      parent,
      { org_id: orgId, limit },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClusterDistributedZombies.inc();
      const end = promClient.respClusterDistributedZombies.startTimer();

      const queryName = 'clusterDistributedZombies';
      logger.debug({req_id, user: whoIs(me), orgId, limit}, `${queryName} enter`);

      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const searchFilter = {
        org_id: orgId,
        updated: {
          $lt: new Moment().subtract(1, 'day').toDate(),
        },
      };
      const result = await commonClusterDistributedSearch(
        models,
        searchFilter,
        limit,
        logger,
        queryName,
      );

      if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClusterDistributedZombies.dec();
      return result;
    }, // end clusterDistributedZombiess

    clusterDistributedSearch: async (
      parent,
      { org_id: orgId, filter, limit = 50 },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClusterDistributedSearch.inc();
      const end = promClient.respClusterDistributedSearch.startTimer();

      const queryName = 'clusterDistributedSearch';
      logger.debug({req_id, user: whoIs(me), orgId, filter, limit}, `${queryName} enter`);

      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      // If no filter provide, just query based on orig id
      if (!filter) {
        const result = await commonClusterDistributedSearch(
          models,
          { org_id: orgId },
          limit,
          logger,
          queryName,
        );

        if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
        promClient.queClusterDistributedSearch.dec();
        return result;
      }

      // Filter provided, build the search filter and query
      const searchFilter = buildSearchForClusterName(orgId, filter);
      const result = await commonClusterDistributedSearch(
        models,
        searchFilter,
        limit,
        logger,
        queryName,
      );

      if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClusterDistributedSearch.dec();
      return result;
    }, // end clusterDistributedSearch

    // Summarize the number clusters by version for active clusters.
    // Active means the cluster information has been updated in the last day
    clusterDistributedCountByKubeVersion: async (
      parent,
      { org_id: orgId },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClusterDistributedCountByKubeVersion.inc();
      const end = promClient.respClusterDistributedCountByKubeVersion.startTimer();

      const queryName = 'clusterDistributedCountByKubeVersion';
      logger.debug({req_id, user: whoIs(me), orgId}, `${queryName} enter`);

      // Validate user, throw error if not valid
      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

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
        logger.error(error,
          `${queryName} encountered an error when process for req_id ${req_id}`,
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
      logger.debug(`${queryName} totalResults: ${JSON.stringify(totalResults, null, 4)} for req_id ${req_id}`);

      if(totalResults){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClusterDistributedCountByKubeVersion.dec();
      return totalResults;
    }, // end clusterDistributedCountByKubeVersion
  }, // end query
}; // end default

module.exports = clusterDistributedResolvers;
