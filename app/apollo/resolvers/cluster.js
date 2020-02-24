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
const { validAuth } = require ('./common');

const buildSearchFilter = (ordId, searchStr) => {
  let ands = [];
  const tokens = searchStr.split(/\s+/);
  if(tokens.length > 0) {
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

const commonClusterSearch = async (
  models,
  searchFilter,
  limit,
  startingAfter,
) => {
  let results = [];

  // If startingAfter specified, we are doing pagination so add another filter
  if (startingAfter) {
    Object.assign(searchFilter, { _id: { $lt: startingAfter } });
  }

  results = await models.Cluster.find(searchFilter)
    .sort({ _id: -1 })
    .limit(limit)
    .lean();
  return results;
};

const clusterResolvers = {
  Query: {
    clusterByClusterID: async (
      parent,
      { org_id: orgId, cluster_id: clusterId },
      { models, me, req_id, logger },
    ) => {
      const queryName = 'clusterByClusterID';
      logger.debug(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, clusterId: ${clusterId}`,
      );

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const result = await models.Cluster.findOne({
        org_id: orgId,
        cluster_id: clusterId,
      }).lean();

      return result;
    }, // end cluster by _id

    // Return a list of clusters based on org_id.
    // sorted with newest document first
    // optional args:
    // - limit: number of docs to return. default 50, 0 means return all
    // - startingAfter: for pagination. Specify the _id of the document you want results
    //   older than.
    clustersByOrgID: async (
      parent,
      { org_id: orgId, limit, startingAfter },
      { models, me, req_id, logger },
    ) => {
      const queryName = 'clustersByOrgID';
      logger.info(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, limit: ${limit}`,
      );

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const searchFilter = { org_id: orgId };
      return commonClusterSearch(models, searchFilter, limit, startingAfter);
    }, // end clusterByOrgId

    // Find all the clusters that have not been updated in the last day
    clusterZombies: async (
      parent,
      { org_id: orgId, limit },
      { models, me, req_id, logger },
    ) => {
      const queryName = 'clusterZombies';
      logger.debug(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, limit: ${limit}`,
      );

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const searchFilter = {
        org_id: orgId,
        updated: {
          $lt: new Moment().subtract(1, 'day').toDate(),
        },
      };
      return commonClusterSearch(models, searchFilter, limit);
    }, // end clusterZombies

    clusterSearch: async (
      parent,
      { org_id: orgId, filter, limit },
      { models, me, req_id, logger },
    ) => {
      const queryName = 'clusterSearch';
      logger.debug(
        `${queryName}: username: ${me.username}, orgID: ${orgId}, filter: ${filter}, limit: ${limit}`,
      );

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      let searchFilter;
      if (!filter) {
        searchFilter = {
          org_id: orgId,
        };
      } else {
        searchFilter = buildSearchFilter(orgId, filter);
      }

      return commonClusterSearch(models, searchFilter, limit);
    }, // end clusterSearch

    // Summarize the number clusters by version for active clusters.
    // Active means the cluster information has been updated in the last day
    clusterCountByKubeVersion: async (
      parent,
      { org_id: orgId },
      { models, me, req_id, logger },
    ) => {
      const queryName = 'clusterCountByKubeVersion';
      logger.debug(`${queryName}: username: ${me.username}, orgID: ${orgId}`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const results = await models.Cluster.aggregate([
        {
          $match: {
            org_id: orgId,
            updated: { $gte: new Moment().subtract(1, 'day').toDate() },
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

      return results;
    }, // end clusterCountByKubeVersion
  }, // end query
}; // end clusterResolvers

module.exports = clusterResolvers;
