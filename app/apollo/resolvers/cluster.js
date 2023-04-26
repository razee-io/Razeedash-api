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
const { whoIs, checkComplexity, validAuth, getGroupConditionsIncludingEmpty, commonClusterSearch, BasicRazeeError, NotFoundError, RazeeValidationError, RazeeQueryError } = require ('./common');
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
const getCleanupUrl = async (org_id, context) => {
  const { models } = context;
  /*
  Note: this code retrieves the _registration_ url and adds `command=remove`, but this results
  in a URL with unneded params (e.g. orgkey).  It could instead
  generate the `/api/cleanup/razeedeploy-job` url by:
  - replacing `/install/` with `/cleanup/` and truncating query params (e.g. orgkey) before adding RDD Args.
  - introducing a new `getCleanupUrl` for Organization models to implement (falling back to a different approach if not implemented).
  - Somthing else to be determined in the future.
  */
  let { url } = await models.Organization.getRegistrationUrl( org_id, context );
  url += '&command=remove';
  const rddArgs = await getRddArgs(context);
  if (rddArgs.length > 0) {
    rddArgs.forEach(arg => {
      url += `&args=${arg}`;
    });
  }
  return( url );
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
        logger.debug({req_id, user, org_id, clusterId }, `${queryName} enter`);

        checkComplexity( queryFields );

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        const cluster = await models.Cluster.findOne({
          org_id,
          cluster_id: clusterId,
          ...conditions
        }).lean({ virtuals: true });

        if(!cluster){
          throw new NotFoundError(context.req.t('Could not find the cluster with Id {{clusterId}}.', {'clusterId':clusterId}), context);
        }

        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context, [clusterId, cluster.name]);

        logger.info({req_id, user, org_id, clusterId, cluster }, `${queryName} found matching authorized cluster` );

        if(cluster){
          var { url } = await models.Organization.getRegistrationUrl(org_id, context);
          url = url + `&clusterId=${clusterId}`;
          const rddArgs = await getRddArgs(context);
          if (rddArgs.length > 0) {
            rddArgs.forEach(arg => {
              url += `&args=${arg}`;
            });
          }
          if (!cluster.registration) cluster.registration = {};
          cluster.registration.url = url;
        }

        await applyQueryFieldsToClusters([cluster], queryFields, args, context);

        return cluster;
      } catch (error) {
        logger.error({req_id, user, org_id, clusterId, error } , `${queryName} error encountered: ${error.message}`);
        throw error;
      }
    }, // end cluster by _id

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

        checkComplexity( queryFields );

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        const clusters = await models.Cluster.find({
          org_id,
          'registration.name': clusterName,
          ...conditions
        }).limit(2).lean({ virtuals: true });

        // If more than one matching cluster found, throw an error
        if( clusters.length > 1 ) {
          logger.info({req_id, user, org_id, clusterName, clusters }, `${queryName} found ${clusters.length} matching clusters` );
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'cluster', 'name':clusterName}), context);
        }
        const cluster = clusters[0] || null;

        if(!cluster){
          throw new NotFoundError(context.req.t('Could not find the cluster with name {{clusterName}}.', {'clusterName':clusterName}), context);
        }

        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context, [cluster.id, cluster.name, clusterName]);

        if(cluster){
          var { url } = await models.Organization.getRegistrationUrl(org_id, context);
          url = url + `&clusterId=${cluster.id}`;
          const rddArgs = await getRddArgs(context);
          if (rddArgs.length > 0) {
            rddArgs.forEach(arg => {
              url += `&args=${arg}`;
            });
          }
          if (!cluster.registration) cluster.registration = {};
          cluster.registration.url = url;
        }

        await applyQueryFieldsToClusters([cluster], queryFields, args, context);

        return cluster;
      } catch (error) {
        logger.error({req_id, user, org_id, clusterName, error } , `${queryName} error encountered: ${error.message}`);
        throw error;
      }
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
      const { orgId: org_id, limit, skip, startingAfter, clusterId } = args;
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'clustersByOrgId';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, limit, startingAfter}, `${queryName} enter`);

        checkComplexity( queryFields );

        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);
        var searchFilter={};
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

        const clusters = await commonClusterSearch(models, searchFilter, { limit, skip, startingAfter });
        logger.info({req_id, user, org_id, clusters }, `${queryName} found ${clusters.length} matching clusters` );

        await applyQueryFieldsToClusters(clusters, queryFields, args, context);

        return clusters;
      } catch (error) {
        logger.error({req_id, user, org_id, error } , `${queryName} error encountered: ${error.message}`);
        throw error;
      }
    }, // end clustersByOrgId

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

        checkComplexity( queryFields );

        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);

        const searchFilter = {
          org_id,
          updated: {
            $lt: new Moment().subtract(1, 'day').toDate(),
          },
        };
        const clusters = await commonClusterSearch(models, searchFilter, { limit });

        await applyQueryFieldsToClusters(clusters, queryFields, args, context);

        return clusters;
      } catch (error) {
        logger.error({req_id, user, org_id, error } , `${queryName} error encountered: ${error.message}`);
        throw error;
      }
    }, // end inactiveClusters

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

        checkComplexity( queryFields );

        // first get all users permitted cluster groups,
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        var props = convertStrToTextPropsObj(filter);
        var textProp = props.$text || '';
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

        const clusters = await commonClusterSearch(models, searchFilter, { limit, skip });
        logger.info({req_id, user, org_id, clusters }, `${queryName} found ${clusters.length} matching clusters` );

        await applyQueryFieldsToClusters(clusters, queryFields, args, context);

        return clusters;
      } catch (error) {
        logger.error({req_id, user, org_id, error } , `${queryName} error encountered: ${error.message}`);
        throw error;
      }
    }, // end clusterSearch

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

        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', queryName, context);

        const results = await models.Cluster.aggregate([
          {
            $match: {
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
      } catch (error) {
        logger.error({req_id, user, org_id, error } , `${queryName} error encountered: ${error.message}`);
        throw error;
      }
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

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating`);

        await validAuth(me, org_id, ACTIONS.DETACH, TYPES.CLUSTER, queryName, context);

        validateString( 'org_id', org_id );
        validateString( 'cluster_id', cluster_id );

        logger.info({req_id, user, org_id, cluster_id}, `${queryName} saving`);

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
        context.pluginContext = {cluster: {registration_details: deletedCluster.registration, uuid: deletedCluster.cluster_id}};

        logger.info({req_id, user, org_id, cluster_id}, `${queryName} returning`);
        return {
          deletedClusterCount: deletedCluster ? (deletedCluster.cluster_id === cluster_id ? 1 : 0) : 0,
          deletedResourceCount: deletedResources.modifiedCount,
          deletedResourceYamlHistCount: deletedResourceYamlHist.modifiedCount,
          deletedServiceSubscriptionCount: deletedServiceSubscription.deletedCount,
          url: await getCleanupUrl( org_id, context ),
        };
      } catch (error) {
        logger.error({req_id, user, org_id, cluster_id, error } , `${queryName} error encountered: ${error.message}`);
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

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id}, `${queryName} validating`);

        await validAuth(me, org_id, ACTIONS.DETACH, TYPES.CLUSTER, queryName, context);

        validateString( 'org_id', org_id );

        logger.info({req_id, user, org_id}, `${queryName} saving`);

        // Allow graphQL plugins to retrieve more information. deleteClusters can delete clusters. Include details of each deleted resource in pluginContext.
        const clusters = await commonClusterSearch(models, {org_id}, { limit: 0, skip: 0, startingAfter: null });
        context.pluginContext = {
          clusters: clusters.map( c => {
            return( {cluster: {registration_details: c.registration, uuid: c.cluster_id }} );
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

        logger.info({req_id, user, org_id}, `${queryName} returning`);
        return {
          deletedClusterCount: deletedClusters.deletedCount,
          deletedResourceCount: deletedResources.modifiedCount,
          deletedResourceYamlHistCount: deletedResourceYamlHist.modifiedCount,
          deletedServiceSubscriptionCount: deletedServiceSubscription.deletedCount,
          url: await getCleanupUrl( org_id, context ),
        };
      } catch (error) {
        logger.error({req_id, user, org_id, error } , `${queryName} error encountered: ${error.message}`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end delete cluster by org_id

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
        logger.info({ req_id, user, org_id, registration }, `${queryName} validating`);

        await validAuth(me, org_id, ACTIONS.REGISTER, TYPES.CLUSTER, queryName, context);

        logger.info({ req_id, user, org_id, registration }, `${queryName} validating - authorized`);

        validateString( 'org_id', org_id );
        validateJson( 'registration', registration );
        if (!registration.name) {
          throw new RazeeValidationError(context.req.t('A cluster name is not defined in the registration data'), context);
        }
        validateName( 'registration.name', registration.name );

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
          logger.info({ req_id, user, org_id, registration }, `${queryName} validating - name is unique`);

          // validate the number of total clusters are under the limit
          const total = await models.Cluster.count({org_id});
          if (total >= CLUSTER_LIMITS.MAX_TOTAL ) {
            throw new RazeeValidationError(context.req.t('You have exceeded the maximum amount of clusters for this org - {{org_id}}', {'org_id':org_id}), context);
          }

          logger.info({ req_id, user, org_id, registration }, `${queryName} validating - cluster count ${total} <= ${CLUSTER_LIMITS.MAX_TOTAL}`);

          // validate the number of pending clusters are under the limit
          const total_pending = await models.Cluster.count({org_id, reg_state: {$in: [CLUSTER_REG_STATES.REGISTERING, CLUSTER_REG_STATES.PENDING]}});
          if (total_pending >= CLUSTER_LIMITS.MAX_PENDING ) {
            throw new RazeeValidationError(context.req.t('You have exeeded the maximum amount of pending clusters for this org - {{org_id}}.', {'org_id':org_id}), context);
          }

          logger.info({ req_id, user, org_id, registration }, `${queryName} validating - pending cluster count ${total_pending} <= ${CLUSTER_LIMITS.MAX_PENDING}`);
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
        var { url } = await models.Organization.getRegistrationUrl(org_id, context);
        url = url + `&clusterId=${cluster_id}`;
        const rddArgs = await getRddArgs(context);
        if (rddArgs.length > 0) {
          rddArgs.forEach(arg => {
            url += `&args=${arg}`;
          });
        }

        // Allow graphQL plugins to retrieve more information. registerCluster can create clusters. Include details of each created resource in pluginContext.
        context.pluginContext = {cluster: {registration_details: registration, uuid: cluster_id}};

        logger.info({req_id, user, org_id, registration, cluster_id}, `${queryName} returning`);
        return { url, orgId: org_id, clusterId: cluster_id, orgKey: bestOrgKey( org ).key, regState: reg_state, registration };
      } catch (error) {
        logger.error({ req_id, user, org_id, registration, error }, `${queryName} error encountered: ${error.message}`);

        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        // Note: mongo/mongoose errors will not have a 'message' attribute, look like: { index: 0, code: 11000, keyPattern: ....}
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message || `code ${error.code}`}), context);
      }
    }, // end registerCluster

    enableRegistrationUrl: async (parent, { orgId: org_id, clusterId: cluster_id }, context) => {
      const queryName = 'enableRegistrationUrl';
      const { models, me, req_id, logger } = context;

      const user = whoIs(me);

      try {
        logger.info({ req_id, user, org_id, cluster_id }, `${queryName} validating`);

        await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.CLUSTER, queryName, context);

        validateString( 'org_id', org_id );
        validateString( 'cluster_id', cluster_id );

        logger.info({ req_id, user, org_id, cluster_id }, `${queryName} saving`);

        const updatedCluster = await models.Cluster.findOneAndUpdate(
          {org_id: org_id, cluster_id: cluster_id},
          {$set: {reg_state: CLUSTER_REG_STATES.REGISTERING}});

        if (updatedCluster) {
          var { url } = await models.Organization.getRegistrationUrl(org_id, context);
          url = url + `&clusterId=${cluster_id}`;
          const rddArgs = await getRddArgs(context);
          if (rddArgs.length > 0) {
            rddArgs.forEach(arg => {
              url += `&args=${arg}`;
            });
          }

          // Allow graphQL plugins to retrieve more information. enableRegistrationUrl can update clusters. Include details of each updated resource in pluginContext.
          context.pluginContext = {cluster: {registration_details: updatedCluster.registration, uuid: cluster_id}};

          logger.info({ req_id, user, org_id, cluster_id }, `${queryName} returning`);
          return { url };
        } else {
          logger.info({ req_id, user, org_id, cluster_id }, `${queryName} returning (no update)`);
          return null;
        }
      } catch (error) {
        logger.error({ req_id, user, org_id, cluster_id, error }, `${queryName} error encountered: ${error.message}`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end enableRegistrationUrl
  }
}; // end clusterResolvers

module.exports = clusterResolvers;
