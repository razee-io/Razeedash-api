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
const { RDD_STATIC_ARGS, ACTIONS, TYPES, CLUSTER_LIMITS, CLUSTER_REG_STATES } = require('../models/const');
const { whoIs, validAuth, getGroupConditionsIncludingEmpty } = require ('./common');
const { v4: UUID } = require('uuid');
const { UserInputError, ValidationError } = require('apollo-server');
const GraphqlFields = require('graphql-fields');
const _ = require('lodash');

const buildSearchFilter = (ordId, condition, searchStr) => {
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

  ands.push({org_id: ordId});

  ands.push(condition);

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

const applyQueryFieldsToClusters = async(clusters, queryFields, { resourceLimit }, models)=>{
  const clusterIds = _.map(clusters, 'cluster_id');
  resourceLimit = resourceLimit || 500;

  if(queryFields.resources) {
    if (clusterIds.length > 0) {
      const resources = await models.Resource.find({ cluster_id: { $in: clusterIds } }).limit(resourceLimit).lean();
      const resourcesByClusterId = _.groupBy(resources, 'cluster_id');
      _.each(clusters, (cluster) => {
        cluster.resources = resourcesByClusterId[cluster.cluster_id] || [];
      });
    }
  }
};

const clusterResolvers = {
  Query: {
    clusterByClusterID: async (
      parent,
      { org_id: orgId, cluster_id: clusterId, resourceLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterByClusterID';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, clusterId}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const cluster = await models.Cluster.findOne({
        org_id: orgId,
        cluster_id: clusterId,
        ...conditions
      }).lean();

      if(!cluster){
        return null;
      }

      await applyQueryFieldsToClusters([cluster], queryFields, { resourceLimit }, models);

      return cluster;
    }, // end cluster by _id

    // Return a list of clusters based on org_id.
    // sorted with newest document first
    // optional args:
    // - limit: number of docs to return. default 50, 0 means return all
    // - startingAfter: for pagination. Specify the _id of the document you want results
    //   older than.
    clustersByOrgID: async (
      parent,
      { org_id: orgId, limit, startingAfter, resourceLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clustersByOrgID';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, limit, startingAfter}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const searchFilter = { org_id: orgId, ...conditions };
      const clusters = await commonClusterSearch(models, searchFilter, limit, startingAfter);

      await applyQueryFieldsToClusters(clusters, queryFields, { resourceLimit }, models);

      return clusters;
    }, // end clusterByOrgId

    // Find all the clusters that have not been updated in the last day
    clusterZombies: async (
      parent,
      { org_id: orgId, limit, resourceLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterZombies';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, limit}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);

      const searchFilter = {
        org_id: orgId,
        updated: {
          $lt: new Moment().subtract(1, 'day').toDate(),
        },
      };
      const clusters = await commonClusterSearch(models, searchFilter, limit);

      await applyQueryFieldsToClusters(clusters, queryFields, { resourceLimit }, models);

      return clusters;
    }, // end clusterZombies

    clusterSearch: async (
      parent,
      { org_id: orgId, filter, limit, resourceLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterSearch';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, filter, limit}, `${queryName} enter`);

      // first get all users permitted cluster groups,
      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      let searchFilter;
      if (!filter) {
        searchFilter = {
          org_id: orgId,
          ...conditions
        };
      } else {
        searchFilter = buildSearchFilter(orgId, conditions, filter);
      }

      const clusters = commonClusterSearch(models, searchFilter, limit);

      await applyQueryFieldsToClusters(clusters, queryFields, { resourceLimit }, models);

      return clusters;
    }, // end clusterSearch

    // Summarize the number clusters by version for active clusters.
    // Active means the cluster information has been updated in the last day
    clusterCountByKubeVersion: async (
      parent,
      { org_id: orgId },
      context,
    ) => {
      const queryName = 'clusterCountByKubeVersion';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const results = await models.Cluster.aggregate([
        {
          $match: {
            org_id: orgId,
            updated: { $gte: new Moment().subtract(1, 'day').toDate() },
            ...conditions
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

  Mutation: {
    deleteClusterByClusterID: async (
      parent,
      { org_id, cluster_id },
      context,
    ) => {
      const queryName = 'deleteClusterByClusterID';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), org_id, cluster_id}, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.DETACH, TYPES.CLUSTER, queryName, context);

      try {
        const deletedCluster = await models.Cluster.findOneAndDelete({org_id,
          cluster_id});

        //TODO: soft delete the resources for now. We need to have a background process to
        // clean up S3 contents based on deleted flag. 
        const deletedResources = await models.Resource.updateMany({ org_id, cluster_id }, 
          {$set: { deleted: true }}, { upsert: false });

        logger.debug({req_id, user: whoIs(me), org_id, cluster_id, deletedResources, deletedCluster}, `${queryName} results are`);

        return {deletedClusterCount: deletedCluster ? (deletedCluster.cluster_id === cluster_id?  1: 0) : 0, 
          deletedResourceCount: deletedResources.modifiedCount !== undefined ? deletedResources.modifiedCount : deletedResources.nModified };
        
      } catch (error) {
        logger.error({req_id, user: whoIs(me), org_id, cluster_id, error } , `${queryName} error encountered`);
        throw error;
      }
    }, // end delete cluster by org_id and cluster_id

    deleteClusters: async (
      parent,
      { org_id },
      context,
    ) => {
      const queryName = 'deleteClusters';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), org_id}, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.DETACH, TYPES.CLUSTER, queryName, context);

      try {
        const deletedClusters = await models.Cluster.deleteMany({ org_id });

        //TODO: soft delete the resources for now. We need to have a background process to
        // clean up S3 contents based on deleted flag. 
        const deletedResources = await models.Resource.updateMany({ org_id }, 
          {$set: { deleted: true }}, { upsert: false });

        logger.debug({req_id, user: whoIs(me), org_id, deletedResources, deletedClusters}, `${queryName} results are`);

        return {deletedClusterCount: deletedClusters.deletedCount, 
          deletedResourceCount: deletedResources.modifiedCount !== undefined ? deletedResources.modifiedCount : deletedResources.nModified };
        
      } catch (error) {
        logger.error({req_id, user: whoIs(me), org_id, error } , `${queryName} error encountered`);
        throw error;
      }
    }, // end delete cluster by org_id 

    registerCluster: async (parent, { org_id, registration }, context) => {
      const queryName = 'registerCluster';
      const { models, me, req_id, logger } = context;
      logger.debug({ req_id, user: whoIs(me), org_id, registration }, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.REGISTER, TYPES.CLUSTER, queryName, context);

      try {
        var error;
        if (!registration.name) {
          error = new UserInputError('cluster name is not defined in registration data.');
        }

        // validate the number of total clusters are under the limit
        const total = await models.Cluster.count({org_id});
        if (!error && total > CLUSTER_LIMITS.MAX_TOTAL ) {
          error = new ValidationError(`Too many clusters are registered under ${org_id}.`);                
        }

        // validate the number of pending clusters are under the limit
        const total_pending = await models.Cluster.count({org_id, reg_state: {$in: [CLUSTER_REG_STATES.REGISTERING, CLUSTER_REG_STATES.PENDING]}});
        if (!error && total_pending > CLUSTER_LIMITS.MAX_PENDING ) {
          error = new ValidationError(`Too many concurrent pending clusters under ${org_id}.`);          
        }

        // we do not handle cluster groups here, it is handled by groupCluster Api

        if (!error && await models.Cluster.findOne(
          { $and: [ 
            { org_id: org_id },
            {$or: [
              {'registration.name': registration.name },
              {'metadata.name': registration.name },
            ]}
          ]}).lean()) {
          error = new UserInputError(`Another cluster already exists with the same registration name ${registration.name}`);
        }
        if (error) throw error;

        const cluster_id = UUID();
        const reg_state = CLUSTER_REG_STATES.REGISTERING;
        await models.Cluster.create({ org_id, cluster_id, reg_state, registration });
        
        const org = await models.Organization.findById(org_id);
        var { url } = await models.Organization.getRegistrationUrl(org_id, context);
        url = url + `&clusterId=${cluster_id}`;
        if (RDD_STATIC_ARGS.length > 0) {
          RDD_STATIC_ARGS.forEach(arg => {
            url += `&args=${arg}`;
          });
        }
        return { url, org_id: org_id, clusterId: cluster_id, orgKey: org.orgKeys[0], regState: reg_state, registration };
      } catch (error) {
        logger.error({ req_id, user: whoIs(me), org_id, error }, `${queryName} error encountered`);
        throw error;
      }
    }, // end registerCluster 
  }
}; // end clusterResolvers

module.exports = clusterResolvers;
