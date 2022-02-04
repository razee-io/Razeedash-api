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
const { whoIs, validAuth, getGroupConditionsIncludingEmpty, BasicRazeeError, NotFoundError, RazeeValidationError, RazeeQueryError } = require ('./common');
const { v4: UUID } = require('uuid');
const GraphqlFields = require('graphql-fields');
const _ = require('lodash');
const { convertStrToTextPropsObj } = require('../utils');
const { applyQueryFieldsToClusters } = require('../utils/applyQueryFields');
const axios = require('axios');
const glob = require('glob-promise');
const fs = require('fs');
const objectHash = require('object-hash');

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
  { limit, skip=0, startingAfter }
) => {
  let results = [];

  // If startingAfter specified, we are doing pagination so add another filter
  if (startingAfter) {
    Object.assign(searchFilter, { _id: { $lt: startingAfter } });
  }

  results = await models.Cluster.find(searchFilter)
    .sort({ _id: -1 })
    .limit(limit)
    .skip(skip)
    .lean({ virtuals: true });
  return results;
};

const getAddClusterWebhookHeaders = async()=>{
  // loads the headers specified in the 'razeedash-add-cluster-webhook-headers-secret' secret
  // returns the key-value pairs of the secret as a js obj
  const filesDir = '/var/run/secrets/razeeio/razeedash-api/add-cluster-webhook-headers';
  const fileNames = await glob('**', {
    cwd: filesDir,
    nodir: true,
  });
  const headers = {};
  _.each(fileNames, (name)=>{
    const val = fs.readFileSync(`${filesDir}/${name}`, 'utf8');
    headers[encodeURIComponent(name)] = val;
  });
  return headers;
};

const runAddClusterWebhook = async({ logger, orgId, clusterId, metadata })=>{
  const clusterName = metadata.name;
  const postData = {
    org_id: orgId,
    cluster_id: clusterId,
    cluster_name: clusterName,
  };
  const url = process.env.ADD_CLUSTER_WEBHOOK_URL;
  if(!url){
    return;
  }
  logger.info({ url, postData }, 'posting add cluster webhook');
  try{
    const headers = await getAddClusterWebhookHeaders();
    const result = await axios.post(url, {
      data: postData,
      headers,
    });
    logger.info({ url, postData, statusCode: result.status }, 'posted add cluster webhook');
  }catch(err){
    logger.error({ url, postData, err }, 'add cluster webhook failed');
  }
};

const clusterResolvers = {
  Query: {
    clusterByClusterId: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      var { orgId, clusterId } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterByClusterId';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, clusterId}, `${queryName} enter`);

      //await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const cluster = await models.Cluster.findOne({
        org_id: orgId,
        cluster_id: clusterId,
        ...conditions
      }).lean({ virtuals: true });

      if(!cluster){
        throw new NotFoundError(context.req.t('Could not find the cluster with Id {{clusterId}}.', {'clusterId':clusterId}), context);
      }

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context, [clusterId, cluster.name]);

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

      await applyQueryFieldsToClusters([cluster], queryFields, args, context);

      return cluster;
    }, // end cluster by _id

    clusterByName: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      var { orgId, clusterName } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterByName';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, clusterName}, `${queryName} enter`);

      // await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);

      const cluster = await models.Cluster.findOne({
        org_id: orgId,
        'registration.name': clusterName,
        ...conditions
      }).lean({ virtuals: true });

      if(!cluster){
        throw new NotFoundError(context.req.t('Could not find the cluster with name {{clusterName}}.', {'clusterName':clusterName}), context);
      }

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context, [cluster.id, cluster.name, clusterName]);

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

      await applyQueryFieldsToClusters([cluster], queryFields, args, context);

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
      args,
      context,
      fullQuery
    ) => {
      var { orgId, limit, startingAfter, clusterId} = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clustersByOrgId';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), orgId, limit, startingAfter}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'uuid', queryName, context);
      var searchFilter={};
      if(clusterId){
        searchFilter={ $and: [
          { org_id: orgId },
          {$or: [
            {'registration.clusterId': clusterId}
          ]}
        ], ...conditions};
      }
      else{
        searchFilter = { org_id: orgId, ...conditions };
      }

      const clusters = await commonClusterSearch(models, searchFilter, { limit, startingAfter });

      await applyQueryFieldsToClusters(clusters, queryFields, args, context);

      return clusters;
    }, // end clustersByOrgId

    // Find all the clusters that have not been updated in the last day
    inactiveClusters: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      var { orgId, limit } = args;
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
      const clusters = await commonClusterSearch(models, searchFilter, { limit });

      await applyQueryFieldsToClusters(clusters, queryFields, args, context);

      return clusters;
    }, // end inactiveClusters

    clusterSearch: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      var { orgId, filter, limit, skip, mongoQuery } = args;
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

      if(mongoQuery){
        searchFilter = {
          $and: [
            searchFilter,
            mongoQuery,
          ]
        };
      }

      const clusters = await commonClusterSearch(models, searchFilter, { limit, skip });

      await applyQueryFieldsToClusters(clusters, queryFields, args, context);

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
        // Delete the Cluster record
        const deletedCluster = await models.Cluster.findOneAndDelete({ org_id, cluster_id });
        logger.info({req_id, user: whoIs(me), org_id, cluster_id, deletedCluster}, `Cluster '${cluster_id}' deletion complete`);

        /*
        Delete children/references to the Cluster:
        - No need to check/modify groups as they do not reference member clusters
        - Delete any cluster ServiceSubscriptions
          - ServiceSubscriptions are only on a per-Cluster basis at this time (see serviceSubscription.schema.js)
          - If ever extended to Groups instead, code may need to be updated to ensure ServiceSubscription is not incorrectly deleted
        - Soft-delete any cluster resource
        - Soft-delete any cluster resourceYamlHist

        Soft-deletion: mark the record as deleted, a background process must clean up S3 object and actually delete the db record
        */
        const deletedServiceSubscription = await models.ServiceSubscription.deleteMany({ org_id, clusterId: cluster_id });
        logger.debug({req_id, user: whoIs(me), org_id, cluster_id, deletedServiceSubscription}, 'Subscriptions deletion complete');
        const deletedResources = await models.Resource.updateMany({ org_id, cluster_id }, {$set: { deleted: true }}, { upsert: false });
        logger.debug({req_id, user: whoIs(me), org_id, cluster_id, deletedResources}, 'Resources soft-deletion complete');
        const deletedResourceYamlHist = await models.ResourceYamlHist.updateMany({ org_id, cluster_id }, {$set: { deleted: true }}, { upsert: false });
        logger.debug({req_id, user: whoIs(me), org_id, cluster_id, deletedResourceYamlHist}, 'ResourceYamlHist soft-deletion complete');

        return {
          deletedClusterCount: deletedCluster ? (deletedCluster.cluster_id === cluster_id ? 1 : 0) : 0,
          deletedResourceCount: deletedResources.modifiedCount !== undefined ? deletedResources.modifiedCount : deletedResources.nModified,
          deletedResourceYamlHistCount: deletedResourceYamlHist.modifiedCount !== undefined ? deletedResourceYamlHist.modifiedCount : deletedResourceYamlHist.nModified,
          deletedServiceSubscriptionCount: deletedServiceSubscription.deletedCount,
        };
      } catch (error) {
        logger.error({req_id, user: whoIs(me), org_id, cluster_id, error } , `${queryName} error encountered: ${error.message}`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
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
        // Delete all the Cluster records
        const deletedClusters = await models.Cluster.deleteMany({ org_id });
        logger.info({req_id, user: whoIs(me), org_id, deletedClusters}, 'Clusters deletion complete');

        /*
        Delete children/references to any Clusters:
        - No need to check/modify groups as they do not reference member clusters
        - Delete any cluster ServiceSubscriptions
          - ServiceSubscriptions are only on a per-Cluster basis at this time (see serviceSubscription.schema.js)
          - If ever extended to Groups instead, code may need to be updated to ensure ServiceSubscription is not incorrectly deleted
        - Soft-delete any cluster resource
        - Soft-delete any cluster resourceYamlHist

        Soft-deletion: mark the record as deleted, a background process must clean up S3 object and actually delete the db record
        */
        const deletedServiceSubscription = await models.ServiceSubscription.deleteMany({ org_id });
        logger.debug({req_id, user: whoIs(me), org_id, deletedServiceSubscription}, 'Subscriptions deletion complete');
        const deletedResources = await models.Resource.updateMany({ org_id }, {$set: { deleted: true }}, { upsert: false });
        logger.debug({req_id, user: whoIs(me), org_id, deletedResources}, 'Resources soft-deletion complete');
        const deletedResourceYamlHist = await models.ResourceYamlHist.updateMany({ org_id }, {$set: { deleted: true }}, { upsert: false });
        logger.debug({req_id, user: whoIs(me), org_id, deletedResourceYamlHist}, 'ResourceYamlHist soft-deletion complete');

        return {
          deletedClusterCount: deletedClusters.deletedCount,
          deletedResourceCount: deletedResources.modifiedCount !== undefined ? deletedResources.modifiedCount : deletedResources.nModified,
          deletedResourceYamlHistCount: deletedResourceYamlHist.modifiedCount !== undefined ? deletedResourceYamlHist.modifiedCount : deletedResourceYamlHist.nModified,
          deletedServiceSubscriptionCount: deletedServiceSubscription.deletedCount,
        };
      } catch (error) {
        logger.error({req_id, user: whoIs(me), org_id, error } , `${queryName} error encountered: ${error.message}`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end delete cluster by org_id

    registerCluster: async (parent, { orgId: org_id, registration }, context) => {
      const queryName = 'registerCluster';
      const { models, me, req_id, logger } = context;
      logger.debug({ req_id, user: whoIs(me), org_id, registration }, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.REGISTER, TYPES.CLUSTER, queryName, context);

      try {
        if (!registration.name) {
          throw new RazeeValidationError(context.req.t('A cluster name is not defined in the registration data'), context);
        }

        // validate the number of total clusters are under the limit
        const total = await models.Cluster.count({org_id});
        if (total >= CLUSTER_LIMITS.MAX_TOTAL ) {  // *** shoud be just >
          throw new RazeeValidationError(context.req.t('You have exceeded the maximum amount of clusters for this org - {{org_id}}', {'org_id':org_id}), context);
        }

        // validate the number of pending clusters are under the limit
        const total_pending = await models.Cluster.count({org_id, reg_state: {$in: [CLUSTER_REG_STATES.REGISTERING, CLUSTER_REG_STATES.PENDING]}});
        if (total_pending > CLUSTER_LIMITS.MAX_PENDING ) {
          throw new RazeeValidationError(context.req.t('You have exeeded the maximum amount of pending clusters for this org - {{org_id}}.', {'org_id':org_id}), context);
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
          throw new RazeeValidationError(context.req.t('Another cluster already exists with the same registration name {{registration.name}}', {'registration.name':registration.name}), context);
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
        if(error instanceof BasicRazeeError ){
          throw error;
        }

        logger.error({ req_id, user: whoIs(me), org_id, error }, `${queryName} error encountered`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
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
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end enableRegistrationUrl

    addUpdateCluster: async(parent, { clusterId, orgId: org_id, metadata }, context)=>{
      const { models, me, req_id, logger } = context;

      const org = await models.Organization.findOne({ _id: org_id });

      const queryName = 'addUpdateCluster';
      logger.debug( {req_id, user: whoIs(me), org_id, clusterId }, `${queryName} enter`);

      await validAuth(me, org._id, ACTIONS.UPDATE, TYPES.CLUSTER, queryName, context);

      try {
        const cluster = await models.Cluster.findOne({ org_id: org._id, cluster_id: clusterId});
        var reg_state = CLUSTER_REG_STATES.REGISTERED;
        if (!cluster) {
          // new cluster flow requires a cluster to be registered first.
          if (process.env.CLUSTER_REGISTRATION_REQUIRED) {
            throw new Error('Not found, the api requires you to register the cluster first.');
          }
          const total = await models.Cluster.count({org_id:  org._id});
          if (total >= CLUSTER_LIMITS.MAX_TOTAL ) {
            throw new Error('Too many clusters are registered under this organization.');
          }
          await models.Cluster.create({ org_id: org._id, cluster_id: clusterId, reg_state, registration: {}, metadata, created: new Date(), updated: new Date() });
          runAddClusterWebhook({ logger, orgId: org._id, clusterId, metadata }); // dont await. just put it in the bg
          models.ResourceStat.updateOne({ org_id: org._id }, { $inc: { clusterCount: 1 } }, { upsert: true });
          return {
            code: 200,
            message: 'Welcome to Razee',
          };
        }
        if (cluster.dirty) {
          await models.Cluster.updateOne(
            { org_id: org._id, cluster_id: clusterId },
            { $set: { metadata, reg_state, updated: new Date(), dirty: false } }
          );
          return {
            code: 205,
            message: 'Please resync',
          };
        }
        await models.Cluster.updateOne(
          { org_id: org._id, cluster_id: clusterId },
          { $set: { metadata, reg_state, updated: new Date() } }
        );
        return {
          code: 200,
          message: 'Thanks for the update',
        };
      } catch (err) {
        logger.error(err.message);
        throw err;
      }
    },
    addClusterMessages: async(parent, { clusterId, orgId: org_id, errorData, level, message }, context)=>{
      const { models, me, req_id, logger } = context;

      const org = await models.Organization.findOne({ _id: org_id });

      const queryName = 'addClusterMessages';
      logger.debug( {req_id, user: whoIs(me), org_id, clusterId }, `${queryName} enter`);

      await validAuth(me, org._id, ACTIONS.UPDATE, TYPES.CLUSTER, queryName, context);

      try {
        errorData = JSON.stringify(errorData) || undefined;

        const messageType = 'watch-keeper';

        const messageHash = objectHash(message);
        const key = {
          cluster_id: clusterId,
          org_id: org._id,
          level: level,
          data: errorData,
          message_hash: messageHash,
        };
        const data = {
          level: level,
          message: message,
          data: errorData,
          updated: new Date(),
        };
        const insertData = {
          created: new Date(),
        };
        await models.Message.updateOne(key, { $set: data, $setOnInsert: insertData }, { upsert: true });
        logger.debug({ messagedata: data }, `${messageType} message data posted`);

        return {
          success: true,
        };
      } catch (err) {
        logger.error(err.message);
        throw err;
      }
    },
  }
}; // end clusterResolvers

module.exports = clusterResolvers;
