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
const { whoIs, validAuth, getGroupConditionsIncludingEmpty, NotFoundError, RazeeValidationError, RazeeQueryError } = require ('./common');
const { v4: UUID } = require('uuid');
const GraphqlFields = require('graphql-fields');
const _ = require('lodash');
const { convertStrToTextPropsObj } = require('../utils');
const { applyQueryFieldsToClusters } = require('../utils/applyQueryFields');

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
    .lean({ virtuals: true });
  return results;
};

const clusterResolvers = {
  Query: {
    clusterByClusterId: async (
      parent,
      { orgId, clusterId, resourceLimit, groupLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterByClusterId';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, clusterId}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const cluster = await models.Cluster.findOne({
        org_id: orgId,
        cluster_id: clusterId,
        ...conditions
      }).lean({ virtuals: true });

      if(!cluster){
        throw new NotFoundError(`Could not find the cluster with Id ${clusterId}.`, context); 
      }

      if(cluster){
        var { url } = await models.Organization.getRegistrationUrl(orgId, context);
        url = url + `&clusterId=${clusterId}`;
        if (RDD_STATIC_ARGS.length > 0) {
          RDD_STATIC_ARGS.forEach(arg => {
            url += `&args=${arg}`;
          });
        }
        if (!cluster.registration) cluster.registration = {};
        cluster.registration.url = url;
      }

      await applyQueryFieldsToClusters([cluster], queryFields, { orgId, resourceLimit, groupLimit }, context);

      return cluster;
    }, // end cluster by _id

    clusterByName: async (
      parent,
      { orgId, clusterName, resourceLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterByName';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, clusterName}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const cluster = await models.Cluster.findOne({
        org_id: orgId,
        'registration.name': clusterName,
        ...conditions
      }).lean({ virtuals: true });

      if(!cluster){
        throw new NotFoundError(`Could not find the cluster with name ${clusterName}.`, context);
      }

      if(cluster){
        var { url } = await models.Organization.getRegistrationUrl(orgId, context);
        url = url + `&clusterId=${cluster.id}`;
        if (RDD_STATIC_ARGS.length > 0) {
          RDD_STATIC_ARGS.forEach(arg => {
            url += `&args=${arg}`;
          });
        }
        if (!cluster.registration) cluster.registration = {};
        cluster.registration.url = url;
      }

      await applyQueryFieldsToClusters([cluster], queryFields, { resourceLimit }, context);

      return cluster;
    }, // end clusterByClusterName

    // Return a list of clusters based on org_id.
    // sorted with newest document first
    // optional args:
    // - limit: number of docs to return. default 50, 0 means return all
    // - startingAfter: for pagination. Specify the _id of the document you want results
    //   older than.
    clustersByOrgId: async (
      parent,
      { orgId, limit, startingAfter, resourceLimit, groupLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clustersByOrgId';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, limit, startingAfter}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const searchFilter = { org_id: orgId, ...conditions };
      const clusters = await commonClusterSearch(models, searchFilter, limit, startingAfter);

      await applyQueryFieldsToClusters(clusters, queryFields, { orgId, resourceLimit, groupLimit }, context);

      return clusters;
    }, // end clustersByOrgId

    // Find all the clusters that have not been updated in the last day
    inactiveClusters: async (
      parent,
      { orgId, limit, resourceLimit, groupLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'inactiveClusters';
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

      await applyQueryFieldsToClusters(clusters, queryFields, { orgId, resourceLimit, groupLimit }, context);

      return clusters;
    }, // end inactiveClusters

    clusterSearch: async (
      parent,
      { orgId, filter, limit, resourceLimit, groupLimit },
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

      var props = convertStrToTextPropsObj(filter);
      var textProp = props.$text || '';
      _.assign(conditions, models.Resource.translateAliases(_.omit(props, '$text')));

      let searchFilter;
      if (!textProp) {
        searchFilter = {
          org_id: orgId,
          ...conditions
        };
      }
      else {
        searchFilter = buildSearchFilter(orgId, conditions, textProp);
      }

      const clusters = await commonClusterSearch(models, searchFilter, limit);

      await applyQueryFieldsToClusters(clusters, queryFields, { orgId, resourceLimit, groupLimit }, context);

      return clusters;
    }, // end clusterSearch

    // Summarize the number clusters by version for active clusters.
    // Active means the cluster information has been updated in the last day
    clusterCountByKubeVersion: async (
      parent,
      { orgId },
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

      for (const item of results){ item.id = item._id; }
      return results;
    }, // end clusterCountByKubeVersion
  }, // end query

  Mutation: {
    deleteClusterByClusterId: async (
      parent,
      { orgId: org_id, clusterId: cluster_id },
      context,
    ) => {
      const queryName = 'deleteClusterByClusterId';
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
        throw new RazeeQueryError(`Query ${queryName} error. ${error.message}`, context);
      }
    }, // end delete cluster by org_id and cluster_id

    deleteClusters: async (
      parent,
      { orgId: org_id },
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
        throw new RazeeQueryError(`Query ${queryName} error. ${error.message}`, context);
      }
    }, // end delete cluster by org_id 

    registerCluster: async (parent, { orgId: org_id, registration }, context) => {
      const queryName = 'registerCluster';
      const { models, me, req_id, logger } = context;
      logger.debug({ req_id, user: whoIs(me), org_id, registration }, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.REGISTER, TYPES.CLUSTER, queryName, context);

      try {
        if (!registration.name) {
          throw new RazeeValidationError('A cluster name is not defined in the registration data', context);
        }

        // validate the number of total clusters are under the limit
        const total = await models.Cluster.count({org_id});
        if (total >= CLUSTER_LIMITS.MAX_TOTAL ) {  // *** shoud be just >
          throw new RazeeValidationError(`You have exceeded the maximum amount of clusters for this org - ${org_id}`, context);               
        }

        // validate the number of pending clusters are under the limit
        const total_pending = await models.Cluster.count({org_id, reg_state: {$in: [CLUSTER_REG_STATES.REGISTERING, CLUSTER_REG_STATES.PENDING]}});
        if (total_pending > CLUSTER_LIMITS.MAX_PENDING ) {
          throw new RazeeValidationError(`You have exeeded the maximum amount of pending clusters for this org - ${org_id}.`, context);         
        }

        // we do not handle cluster groups here, it is handled by groupCluster Api

        if (await models.Cluster.findOne(
          { $and: [ 
            { org_id: org_id },
            {$or: [
              {'registration.name': registration.name },
              {'metadata.name': registration.name },
            ]}
          ]}).lean()) {
          throw new RazeeValidationError(`Another cluster already exists with the same registration name ${registration.name}`, context);
        }

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
        return { url, orgId: org_id, clusterId: cluster_id, orgKey: org.orgKeys[0], regState: reg_state, registration };
      } catch (error) {
        if (error.extensions.code === 'ValidationError') {
          throw error;
        }

        logger.error({ req_id, user: whoIs(me), org_id, error }, `${queryName} error encountered`);
        throw new RazeeQueryError(`Query ${queryName} error. ${error.message}`, context);
      }
    }, // end registerCluster 

    enableRegistrationUrl: async (parent, { orgId: org_id, clusterId: cluster_id }, context) => {
      const queryName = 'enableRegistrationUrl';
      const { models, me, req_id, logger } = context;
      logger.debug({ req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.CLUSTER, queryName, context);

      try {
        const updatedCluster = await models.Cluster.findOneAndUpdate(
          {org_id: org_id, cluster_id: cluster_id},
          {$set: {reg_state: CLUSTER_REG_STATES.REGISTERING}});

        if (updatedCluster) {
          var { url } = await models.Organization.getRegistrationUrl(org_id, context);
          url = url + `&clusterId=${cluster_id}`;
          if (RDD_STATIC_ARGS.length > 0) {
            RDD_STATIC_ARGS.forEach(arg => {
              url += `&args=${arg}`;
            });
          }
          return { url };
        } else {
          return null;
        }
      } catch (error) {
        logger.error({ req_id, user: whoIs(me), org_id, error }, `${queryName} error encountered`);
        throw new RazeeQueryError(`Query ${queryName} error. ${error.message}`, context);
      }
    }, // end enableRegistrationUrl
  }
}; // end clusterResolvers

module.exports = clusterResolvers;
