/**
 * Copyright 2020, 2023 IBM Corp. All Rights Reserved.
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
const { ACTIONS, TYPES, CLUSTER_LIMITS, CLUSTER_REG_STATES } = require('../models/const');
const { whoIs, checkComplexity, validAuth, filterResourcesToAllowed, getGroupConditionsIncludingEmpty, commonClusterSearch, BasicRazeeError, NotFoundError, RazeeValidationError, RazeeQueryError } = require ('./common');
const { v4: UUID } = require('uuid');
const GraphqlFields = require('graphql-fields');
const _ = require('lodash');
const { convertStrToTextPropsObj } = require('../utils');
const { applyQueryFieldsToClusters } = require('../utils/applyQueryFields');
const { bestOrgKey } = require('../../utils/orgs');
const { ValidationError } = require('apollo-server');
const { validateString, validateJson, validateName } = require('../utils/directives');
const { getRddArgs } = require('../../utils/rdd');

// Get the URL that returns yaml for cleaning up agents from a cluster
const getCleanupDetails = async (org_id, context) => {
  const { models } = context;
  /*
  Note: this code retrieves the _registration_ url and adds `command=remove`, but this results
  in a URL with unneded params (e.g. most if not all of the rddArgs).  It could instead
  generate the `/api/cleanup/razeedeploy-job` url by:
  - replacing `/install/` with `/cleanup/` and truncating query params.
  - introducing a new `getCleanupDetails` for Organization models to implement (falling back to a different approach if not implemented).
  - Somthing else to be determined in the future.
  */
  let { url, headers } = await models.Organization.getRegistrationUrl( org_id, context );

  // Headers can hold sensitive information, such as an authorization token.
  // Cleanup requirees no authorization token, unlike _registering_ a cluster, so explicitly empty and ignore the headers from the getRegistrationUrl.
  headers = {};

  // Build out the URL, avoiding sensitive data.
  url = `${url}${url.includes('?')?'&':'?'}command=remove`;
  const rddArgs = await getRddArgs(context);
  rddArgs.forEach(arg => {
    url += `&args=${arg}`;
  });

  return( { url, headers } );
};

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

const clusterResolvers = {
  Query: {
    clusterByClusterId: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      const { orgId: org_id, clusterId } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterByClusterId';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, clusterId}, `${queryName} enter`);

        logger.info({req_id, user, org_id, clusterId}, `${queryName} validating`);

        checkComplexity( queryFields );

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        const cluster = await models.Cluster.findOne({
          org_id,
          cluster_id: clusterId,
          ...conditions
        }).lean({ virtuals: true });
        logger.info({req_id, user, org_id, clusterId}, `${queryName} validating - found: ${!!cluster}`);

        const identifiers = cluster ? [clusterId, cluster.registration.name || cluster.name] : [clusterId];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context, identifiers);
        logger.info({req_id, user, org_id, clusterId}, `${queryName} validating - authorized`);

        if (!cluster) {
          throw new NotFoundError(context.req.t('Could not find the cluster with Id {{clusterId}}.', {'clusterId':clusterId}), context);
        }



        if(cluster){
          let { url } = await models.Organization.getRegistrationUrl(org_id, context);

          // Build out the URL, avoiding sensitive data.
          url = `${url}${url.includes('?')?'&':'?'}clusterId=${clusterId}`;
          const rddArgs = await getRddArgs(context);
          rddArgs.forEach(arg => {
            url += `&args=${arg}`;
          });

          if (!cluster.registration) cluster.registration = {};
          // Note: the registration.url should not be used -- the URL will not function without first 'priming' it by calling the `enableRegistrationUrl` API, making the value returned here unusable.
          // It will be removed in a future update.
          cluster.registration.url = url;
        }

        await applyQueryFieldsToClusters([cluster], queryFields, args, context);

        return cluster;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    clusterByName: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      const { orgId: org_id, clusterName } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterByName';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, clusterName}, `${queryName} enter`);

        logger.info({req_id, user, org_id, clusterName}, `${queryName} validating`);

        checkComplexity( queryFields );

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        const clusters = await models.Cluster.find({
          org_id,
          'registration.name': clusterName,
          ...conditions
        }).limit(2).lean({ virtuals: true });
        const cluster = clusters[0] || null;
        logger.info({req_id, user, org_id, clusterName}, `${queryName} validating - found: ${!!cluster}`);

        const identifiers = cluster ? [cluster.cluster_id, clusterName] : [clusterName];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context, identifiers);
        logger.info({req_id, user, org_id, clusterName}, `${queryName} validating - authorized`);

        if (!cluster) {
          throw new NotFoundError(context.req.t('Could not find the cluster with name {{clusterName}}.', {'clusterName':clusterName}), context);
        }

        // If more than one matching cluster found, throw an error
        if(clusters.length > 1) {
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'cluster', 'name':clusterName}), context);
        }

        if(cluster){
          let { url } = await models.Organization.getRegistrationUrl(org_id, context);

          // Build out the URL, avoiding sensitive data.
          url = `${url}${url.includes('?')?'&':'?'}clusterId=${cluster.id}`;
          const rddArgs = await getRddArgs(context);
          rddArgs.forEach(arg => {
            url += `&args=${arg}`;
          });

          if (!cluster.registration) cluster.registration = {};
          // Note: the registration.url should not be used -- the URL will not function without first 'priming' it by calling the `enableRegistrationUrl` API, making the value returned here unusable.
          // It will be removed in a future update.
          cluster.registration.url = url;
        }

        await applyQueryFieldsToClusters([cluster], queryFields, args, context);

        return cluster;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

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
      const { orgId: org_id, limit, skip, startingAfter, clusterId } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clustersByOrgId';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, limit, startingAfter}, `${queryName} enter`);

        logger.info({req_id, user, org_id}, `${queryName} validating`);

        checkComplexity( queryFields );

        let allAllowed = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowed = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id}, `${queryName} validating - allAllowed: ${allAllowed}`);

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);
        let searchFilter={};
        if(clusterId){
          searchFilter={ $and: [
            { org_id },
            {$or: [
              {'registration.clusterId': clusterId}
            ]}
          ], ...conditions};
        }
        else{
          searchFilter = { org_id, ...conditions };
        }

        let clusters = await commonClusterSearch(models, searchFilter, { limit, skip, startingAfter });

        if (!allAllowed){
          clusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, clusters, context);
          logger.info({req_id, user, org_id, clusters}, `${queryName} filtered resources to allowed`);
        }

        await applyQueryFieldsToClusters(clusters, queryFields, args, context);

        return clusters;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    // Find all the clusters that have not been updated in the last day
    inactiveClusters: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      const { orgId: org_id, limit } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'inactiveClusters';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, limit}, `${queryName} enter`);

        logger.info({req_id, user, org_id}, `${queryName} validating`);

        checkComplexity( queryFields );

        let allAllowed = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowed = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id, allAllowed}, `${queryName} validating - allAllowed: ${allAllowed}`);

        const searchFilter = {
          org_id,
          updated: {
            $lt: new Moment().subtract(1, 'day').toDate(),
          },
        };

        let clusters = await commonClusterSearch(models, searchFilter, { limit });

        if (!allAllowed){
          clusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, clusters, context);
          logger.info({req_id, user, org_id, clusters}, `${queryName} filtered resources to allowed`);
        }

        await applyQueryFieldsToClusters(clusters, queryFields, args, context);

        return clusters;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    clusterSearch: async (
      parent,
      args,
      context,
      fullQuery
    ) => {
      const { orgId: org_id, filter, limit, skip, mongoQuery } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clusterSearch';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, filter, limit}, `${queryName} enter`);

        logger.info({req_id, user, org_id}, `${queryName} validating`);

        checkComplexity( queryFields );

        let allAllowed = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowed = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id, allAllowed}, `${queryName} validating - allAllowed: ${allAllowed}`);

        // first get all users permitted cluster groups,
        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        let props = convertStrToTextPropsObj(filter);
        let textProp = props.$text || '';
        _.assign(conditions, models.Resource.translateAliases(_.omit(props, '$text')));

        let searchFilter;
        if (!textProp) {
          searchFilter = {
            org_id,
            ...conditions
          };
        }
        else {
          searchFilter = buildSearchFilter(org_id, conditions, textProp);
        }

        if(mongoQuery){
          searchFilter = {
            $and: [
              searchFilter,
              mongoQuery,
            ]
          };
        }

        let clusters = await commonClusterSearch(models, searchFilter, { limit, skip });

        if (!allAllowed){
          clusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, clusters, context);
          logger.info({req_id, user, org_id, clusters}, `${queryName} filtered resources to allowed`);
        }

        await applyQueryFieldsToClusters(clusters, queryFields, args, context);

        return clusters;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    // Summarize the number clusters by version for active clusters.
    // Active means the cluster information has been updated in the last day
    clusterCountByKubeVersion: async (
      parent,
      { orgId: org_id },
      context,
    ) => {
      const queryName = 'clusterCountByKubeVersion';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id}, `${queryName} enter`);

        logger.info({req_id, user, org_id}, `${queryName} validating`);

        let allAllowed = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowed = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id, allAllowed}, `${queryName} validating - allAllowed: ${allAllowed}`);

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        const searchFilter = {
          org_id,
          updated: { $gte: new Moment().subtract(1, 'day').toDate() },
          ...conditions
        };

        let clusters = await commonClusterSearch(models, searchFilter, { limit: 0 });

        if (!allAllowed){
          clusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, clusters, context);
          logger.info({req_id, user, org_id, clusters}, `${queryName} filtered resources to allowed`);
        }

        // Extract the IDs of filtered authorzied clusters
        const clusterIds = clusters.map(cluster => cluster._id);

        const results = await models.Cluster.aggregate([
          {
            $match: {
              _id: { $in: clusterIds }, // Filter based on the filtered clusters
              org_id,
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
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
  },

  Mutation: {
    deleteClusterByClusterId: async (
      parent,
      { orgId: org_id, clusterId: cluster_id },
      context,
    ) => {
      const queryName = 'deleteClusterByClusterId';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateString( 'cluster_id', cluster_id );

        const cluster = await models.Cluster.findOne({
          org_id,
          cluster_id
        }).lean({ virtuals: true });

        await validAuth(me, org_id, ACTIONS.DETACH, TYPES.CLUSTER, queryName, context, [cluster_id, cluster.registration.name || cluster.name]);
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating - authorized`);

        // If user is authorized but cluster does not exist, throw NotFoundError
        if(!cluster){
          throw new NotFoundError(context.req.t('Could not find the cluster with Id {{clusterId}}.', {'clusterId':cluster_id}), context);
        }

        // Delete the Cluster record
        const deletedCluster = await models.Cluster.findOneAndDelete({ org_id, cluster_id });
        logger.info({req_id, user, org_id, cluster_id, deletedCluster}, `Cluster '${cluster_id}' deletion complete`);

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
        logger.info({req_id, user, org_id, cluster_id, deletedServiceSubscription}, 'Subscriptions deletion complete');
        const deletedResources = await models.Resource.updateMany({ org_id, cluster_id }, {$set: { deleted: true }}, { upsert: false });
        logger.info({req_id, user, org_id, cluster_id, deletedResources}, 'Resources soft-deletion complete');
        const deletedResourceYamlHist = await models.ResourceYamlHist.updateMany({ org_id, cluster_id }, {$set: { deleted: true }}, { upsert: false });
        logger.info({req_id, user, org_id, cluster_id, deletedResourceYamlHist}, 'ResourceYamlHist soft-deletion complete');

        // Allow graphQL plugins to retrieve more information. deleteClusterByClusterId can delete clusters. Include details of each deleted resource in pluginContext.
        context.pluginContext = {cluster: {name: deletedCluster.registration.name, uuid: deletedCluster.cluster_id, registration: deletedCluster.registration}};

        const cleanupDetails = await getCleanupDetails( org_id, context );

        logger.info({req_id, user, org_id, cluster_id}, `${queryName} returning`);
        return {
          deletedClusterCount: deletedCluster ? (deletedCluster.cluster_id === cluster_id ? 1 : 0) : 0,
          deletedResourceCount: deletedResources.modifiedCount,
          deletedResourceYamlHistCount: deletedResourceYamlHist.modifiedCount,
          deletedServiceSubscriptionCount: deletedServiceSubscription.deletedCount,
          url: cleanupDetails.url,
          headers: cleanupDetails.headers,
        };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    deleteClusters: async (
      parent,
      { orgId: org_id },
      context,
    ) => {
      const queryName = 'deleteClusters';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id}, `${queryName} validating`);

        validateString( 'org_id', org_id );

        await validAuth(me, org_id, ACTIONS.DETACH, TYPES.CLUSTER, queryName, context);
        logger.info({req_id, user, org_id}, `${queryName} validating - authorized`);

        // Allow graphQL plugins to retrieve more information. deleteClusters can delete clusters. Include details of each deleted resource in pluginContext.
        const clusters = await commonClusterSearch(models, {org_id}, { limit: 0, skip: 0, startingAfter: null });
        context.pluginContext = {
          clusters: clusters.map( c => {
            return {name: c.registration.name, uuid: c.cluster_id, registration: c.registration};
          })
        };

        // Delete all the Cluster records
        const deletedClusters = await models.Cluster.deleteMany({ org_id });
        logger.info({req_id, user, org_id, deletedClusters}, 'Clusters deletion complete');

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
        logger.info({req_id, user, org_id, deletedServiceSubscription}, 'Subscriptions deletion complete');
        const deletedResources = await models.Resource.updateMany({ org_id }, {$set: { deleted: true }}, { upsert: false });
        logger.info({req_id, user, org_id, deletedResources}, 'Resources soft-deletion complete');
        const deletedResourceYamlHist = await models.ResourceYamlHist.updateMany({ org_id }, {$set: { deleted: true }}, { upsert: false });
        logger.info({req_id, user, org_id, deletedResourceYamlHist}, 'ResourceYamlHist soft-deletion complete');

        const cleanupDetails = await getCleanupDetails( org_id, context );

        logger.info({req_id, user, org_id}, `${queryName} returning`);
        return {
          deletedClusterCount: deletedClusters.deletedCount,
          deletedResourceCount: deletedResources.modifiedCount,
          deletedResourceYamlHistCount: deletedResourceYamlHist.modifiedCount,
          deletedServiceSubscriptionCount: deletedServiceSubscription.deletedCount,
          url: cleanupDetails.url,
          headers: cleanupDetails.headers,
        };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    // Register a cluster without idempotency (repeated calls will fail due to 'already exists' behavior)
    registerCluster: async (parent, { orgId: org_id, registration, idempotent=false }, context) => {
      /*
      Idempotent operation
        - Register must either *create* a new cluster record or *do nothing* (return successfully but with existing record unchanged).
          - "do nothing": If an existing record gets modified, it may change the cluster_id and break things.
      Non-idempotent operation
        - Register must create record or *throw an error*.

      In both cases, a check for existing record is attempted first.
      A unique composite index on org_id and registration.name will also enforce uniqueness on the database side (see models/cluster.schema.js).
      */
      const queryName = 'registerCluster';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, registration}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateJson( 'registration', registration );

        await validAuth(me, org_id, ACTIONS.REGISTER, TYPES.CLUSTER, queryName, context, [registration.name]);

        if (!registration.name) {
          throw new RazeeValidationError(context.req.t('A cluster name is not defined in the registration data'), context);
        }
        validateName( 'registration.name', registration.name );

        logger.info({req_id, user, org_id, registration}, `${queryName} validating - authorized`);

        let cluster_id = UUID();
        let reg_state = CLUSTER_REG_STATES.REGISTERING;

        const existingClusterRecord = await models.Cluster.findOne( { $and: [ { org_id: org_id }, {'registration.name': registration.name } ] } ).lean();
        if( existingClusterRecord ) {
          if( idempotent ) {
            // When idempotent, existing cluster record is not an error condition
          }
          else {
            throw new RazeeValidationError(context.req.t('Another cluster already exists with the same registration name {{registration.name}}', {'registration.name':registration.name}), context);
          }
        }
        else {
          logger.info({req_id, user, org_id, registration}, `${queryName} validating - name is unique`);

          // validate the number of total clusters are under the limit
          const total = await models.Cluster.count({org_id});
          if (total >= CLUSTER_LIMITS.MAX_TOTAL ) {
            throw new RazeeValidationError(context.req.t('You have exceeded the maximum amount of clusters for this org - {{org_id}}', {'org_id':org_id}), context);
          }

          logger.info({req_id, user, org_id, registration}, `${queryName} validating - cluster count ${total} <= ${CLUSTER_LIMITS.MAX_TOTAL}`);

          // validate the number of pending clusters are under the limit
          const total_pending = await models.Cluster.count({org_id, reg_state: {$in: [CLUSTER_REG_STATES.REGISTERING, CLUSTER_REG_STATES.PENDING]}});
          if (total_pending >= CLUSTER_LIMITS.MAX_PENDING ) {
            throw new RazeeValidationError(context.req.t('You have exeeded the maximum amount of pending clusters for this org - {{org_id}}.', {'org_id':org_id}), context);
          }

          logger.info({req_id, user, org_id, registration}, `${queryName} validating - pending cluster count ${total_pending} <= ${CLUSTER_LIMITS.MAX_PENDING}`);
        }

        logger.info({req_id, user, org_id, registration}, `${queryName} saving`);

        if( idempotent && existingClusterRecord ) {
          // Nothing to do, cluster is already registered. Use existing cluster_id and regstate in return values, continue.
          cluster_id = existingClusterRecord.cluster_id;
          reg_state = existingClusterRecord.reg_state;
        }
        else {
          await models.Cluster.create({ org_id, cluster_id, reg_state, registration });
          logger.info({req_id, user, org_id, registration}, `${queryName} save complete`);
        }

        logger.info({req_id, user, org_id, registration}, `${queryName} retrieving registration url`);

        const org = await models.Organization.findById(org_id);

        let { url, headers } = await models.Organization.getRegistrationUrl(org_id, context);

        // Headers can hold sensitive information.  If no headers specified, use empty object.
        headers = headers || {};

        // Build out the URL, avoiding sensitive data.
        url = `${url}${url.includes('?')?'&':'?'}clusterId=${cluster_id}`;
        const rddArgs = await getRddArgs(context);
        rddArgs.forEach(arg => {
          url += `&args=${arg}`;
        });

        // Allow graphQL plugins to retrieve more information. registerCluster can create clusters. Include details of each created resource in pluginContext.
        context.pluginContext = {cluster: {name: registration.name, uuid: cluster_id, registration: registration}};

        logger.info({req_id, user, org_id, registration, cluster_id}, `${queryName} returning`);
        return { url, headers, orgId: org_id, clusterId: cluster_id, orgKey: bestOrgKey( org ).key, regState: reg_state, registration };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    enableRegistrationUrl: async (parent, { orgId: org_id, clusterId: cluster_id }, context) => {
      const queryName = 'enableRegistrationUrl';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateString( 'cluster_id', cluster_id );

        const cluster = await models.Cluster.findOne({
          org_id,
          cluster_id
        }).lean({ virtuals: true });
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating - found: ${!!cluster}`);

        const identifiers = cluster ? [cluster_id, cluster.registration.name || cluster.name] : [cluster_id];
        await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.CLUSTER, queryName, context, identifiers);
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating - authorized`);

        if (!cluster) {
          throw new NotFoundError(context.req.t('Could not find the cluster with Id {{clusterId}}.', {'clusterId':cluster_id}), context);
        }

        const updatedCluster = await models.Cluster.findOneAndUpdate(
          {org_id: org_id, cluster_id: cluster_id},
          {$set: {reg_state: CLUSTER_REG_STATES.REGISTERING}});

        if (updatedCluster) {
          let { url, headers } = await models.Organization.getRegistrationUrl(org_id, context);

          // Headers can hold sensitive information.  If no headers specified, use empty object.
          headers = headers || {};

          // Build out the URL, avoiding sensitive data.
          url = `${url}${url.includes('?')?'&':'?'}clusterId=${cluster_id}`;
          const rddArgs = await getRddArgs(context);
          rddArgs.forEach(arg => {
            url += `&args=${arg}`;
          });

          // Allow graphQL plugins to retrieve more information. enableRegistrationUrl can update clusters. Include details of each updated resource in pluginContext.
          context.pluginContext = {cluster: {name: updatedCluster.registration.name, uuid: cluster_id, registration: updatedCluster.registration}};

          logger.info({req_id, user, org_id, cluster_id}, `${queryName} returning`);
          return { url, headers };
        } else {
          logger.info({req_id, user, org_id, cluster_id}, `${queryName} returning (no update)`);
          return null;
        }
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
  }
};

module.exports = clusterResolvers;
