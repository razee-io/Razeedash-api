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
      //Get api requests latency & queue metrics
      promClient.queClusterByClusterID.inc();
      const end = promClient.respClusterByClusterID.startTimer();

      const queryName = 'clusterByClusterID';
      logger.debug({req_id, user: whoIs(me), orgId, clusterId}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const result = await models.Cluster.findOne({
        org_id: orgId,
        cluster_id: clusterId,
      }).lean();

      if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClusterByClusterID.dec();
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
      //Get api requests latency & queue metrics
      promClient.queClustersByOrgID.inc();
      const end = promClient.respClustersByOrgID.startTimer();

      const queryName = 'clustersByOrgID';
      logger.debug({req_id, user: whoIs(me), orgId, limit, startingAfter}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const searchFilter = { org_id: orgId };
      const result = await commonClusterSearch(models, searchFilter, limit, startingAfter);

      if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClustersByOrgID.dec();

      return result;
    }, // end clusterByOrgId

    // Find all the clusters that have not been updated in the last day
    clusterZombies: async (
      parent,
      { org_id: orgId, limit },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClusterZombies.inc();
      const end = promClient.respClusterZombies.startTimer();

      const queryName = 'clusterZombies';
      logger.debug({req_id, user: whoIs(me), orgId, limit}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      const searchFilter = {
        org_id: orgId,
        updated: {
          $lt: new Moment().subtract(1, 'day').toDate(),
        },
      };
      const result = await commonClusterSearch(models, searchFilter, limit);

      if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClusterZombies.dec();
      return result;
    }, // end clusterZombies

    clusterSearch: async (
      parent,
      { org_id: orgId, filter, limit },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClusterSearch.inc();
      const end = promClient.respClusterSearch.startTimer();

      const queryName = 'clusterSearch';
      logger.debug({req_id, user: whoIs(me), orgId, filter, limit}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, models, queryName, req_id, logger);

      let searchFilter;
      if (!filter) {
        searchFilter = {
          org_id: orgId,
        };
      } else {
        searchFilter = buildSearchFilter(orgId, filter);
      }

      const result = await commonClusterSearch(models, searchFilter, limit);

      if(result){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClusterSearch.dec();
      return result;
    }, // end clusterSearch

    // Summarize the number clusters by version for active clusters.
    // Active means the cluster information has been updated in the last day
    clusterCountByKubeVersion: async (
      parent,
      { org_id: orgId },
      { models, me, req_id, logger },
    ) => {
      //Get api requests latency & queue metrics
      promClient.queClusterCountByKubeVersion.inc();
      const end = promClient.respClusterCountByKubeVersion.startTimer();

      const queryName = 'clusterCountByKubeVersion';
      logger.debug({req_id, user: whoIs(me), orgId}, `${queryName} enter`);

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

      if(results){ end({ StatusCode: '200' }); }   //stop the response time timer, and report the metric
      promClient.queClusterCountByKubeVersion.dec();
      return results;
    }, // end clusterCountByKubeVersion
  }, // end query
}; // end clusterResolvers

module.exports = clusterResolvers;
