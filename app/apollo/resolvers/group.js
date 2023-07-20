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

const _ = require('lodash');
const { v4: UUID } = require('uuid');
const {  ValidationError } = require('apollo-server');

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, checkComplexity, validAuth, filterResourcesToAllowed, getAllowedResources, commonClusterSearch, NotFoundError, BasicRazeeError, RazeeValidationError, RazeeQueryError } = require ('./common');
const { GraphqlPubSub } = require('../subscription');
const GraphqlFields = require('graphql-fields');
const { applyQueryFieldsToGroups } = require('../utils/applyQueryFields');

// RBAC Sync
const { groupsRbacSync } = require('../utils/rbacSync');

const pubSub = GraphqlPubSub.getInstance();

const { validateString, validateName } = require('../utils/directives');

const groupResolvers = {
  Query: {
    groups: async(parent, { orgId: org_id }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { me, req_id, logger } = context;
      const queryName = 'groups';

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id}, `${queryName} enter`);

        checkComplexity( queryFields );

        const groups = await getAllowedResources(me, org_id, ACTIONS.READ, TYPES.GROUP, queryName, context);
        logger.info({req_id, user, org_id}, `${queryName} retrieved allowed resources`);

        await applyQueryFieldsToGroups(groups, queryFields, { orgId: org_id }, context);

        return groups;
      }
      catch (error) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
    group: async(parent, { orgId: org_id, uuid }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'group';

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, uuid}, `${queryName} enter`);

        logger.info({req_id, user, org_id, uuid}, `${queryName} validating`);

        checkComplexity( queryFields );

        const group = await models.Group.findOne({ org_id, uuid }).lean({ virtuals: true });
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating - found: ${!!group}`);

        const identifiers = group ? [uuid, group.name] : [uuid];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.GROUP, queryName, context, identifiers);
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating - authorized`);

        if (!group) {
          throw new NotFoundError(context.req.t('could not find group with uuid {{uuid}}.', {'uuid':uuid}), context);
        }

        await applyQueryFieldsToGroups([group], queryFields, { orgId: org_id }, context);

        return group;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
    groupByName: async(parent, { orgId: org_id, name }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'groupByName';

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, org_id, name}, `${queryName} enter`);

        logger.info({req_id, user, org_id, name}, `${queryName} validating`);

        checkComplexity( queryFields );

        const groups = await models.Group.find({ org_id, name }).limit(2).lean({ virtuals: true });
        const group = groups[0] || null;
        logger.info({req_id, user, org_id, name}, `${queryName} validating - found: ${group.length}`);

        const identifiers = group ? [group.uuid, name] : [name];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.GROUP, queryName, context, identifiers);
        logger.info({req_id, user, org_id, name}, `${queryName} validating - authorized`);

        if (!group) {
          throw new NotFoundError(context.req.t('could not find group with name {{name}}.', {'name':name}), context);
        }

        // If more than one matching group found, throw an error
        if( groups.length > 1 ) {
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'group', 'name':name}), context);
        }

        await applyQueryFieldsToGroups([group], queryFields, { orgId: org_id }, context);

        return group;
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
    addGroup: async (parent, { orgId: org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addGroup';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, name}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateName( 'name', name );

        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, [name]);
        logger.info({req_id, user, org_id, name}, `${queryName} validating - authorized`);

        // might not necessary with unique index. Worth to check to return error better.
        const group = await models.Group.findOne({ org_id: org_id, name });
        if(group){
          throw new ValidationError(context.req.t('The group name {{name}} already exists.', {'name':name}));
        }

        logger.info({req_id, user, org_id, name}, `${queryName} saving`);

        const uuid = UUID();
        await models.Group.create({
          _id: UUID(),
          uuid, org_id: org_id, name, owner: me._id,
        });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        // Allow graphQL plugins to retrieve more information. addGroup can create groups. Include details of each created resource in pluginContext.
        context.pluginContext = {group: {name: name, uuid: uuid}};

        logger.info({req_id, user, org_id, name}, `${queryName} returning`);
        return {
          uuid,
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

    removeGroup: async (parent, { orgId: org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeGroup';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateString( 'uuid', uuid );

        const group = await models.Group.findOne({ uuid, org_id: org_id }).lean();
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating - found: ${!!group}`);

        const identifiers = group ? [uuid, group.name] : [uuid];
        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, identifiers);
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating - authorized`);

        if (!group) {
          throw new NotFoundError(context.req.t('group uuid "{{uuid}}" not found', {'uuid':uuid}));
        }

        const subCount = await models.Subscription.count({ org_id: org_id, groups: group.name });
        if(subCount > 0){
          throw new ValidationError(context.req.t('{{subCount}} subscriptions depend on this cluster group. Please update/remove them before removing this group.', {'subCount':subCount}));
        }

        const clusterIds = await models.Cluster.distinct('cluster_id', { org_id: org_id, 'groups.uuid': group.uuid });

        logger.info({ req_id, user, org_id, uuid }, `${queryName} saving`);

        if(clusterIds && clusterIds.length > 0) {
          await groupResolvers.Mutation.unGroupClusters(parent, {orgId: org_id, uuid, clusters: clusterIds}, context);
        }

        await models.Group.deleteOne({ org_id: org_id, uuid:group.uuid });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        // Allow graphQL plugins to retrieve more information. removeGroup can delete groups. Include details of each deleted resource in pluginContext.
        context.pluginContext = {group: {name: group.name, uuid: group.uuid}};

        logger.info({ req_id, user, org_id, uuid }, `${queryName} returning`);
        return {
          uuid: group.uuid,
          success: true,
        };
      }
      catch( error ) {
        logger.error({ req_id, user, org_id, error }, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    removeGroupByName: async (parent, { orgId: org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeGroupByName';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, name}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateName( 'name', name );

        const groups = await models.Group.find({ name, org_id: org_id }).limit(2).lean({ virtuals: true });
        const group = groups[0] || null;
        logger.info({req_id, user, org_id, name}, `${queryName} validating - found: ${group.length}`);

        const identifiers = group ? [group.uuid, name] : [name];
        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, identifiers);
        logger.info({req_id, user, org_id, name}, `${queryName} validating - authorized`);

        if (!group) {
          throw new NotFoundError(context.req.t('group name "{{name}}" not found', {'name':name}));
        }

        // If more than one matching group found, throw an error
        if( groups.length > 1 ) {
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'group', 'name':name}), context);
        }

        const subCount = await models.Subscription.count({ org_id: org_id, groups: group.name });
        if(subCount > 0){
          throw new ValidationError(context.req.t('{{subCount}} subscriptions depend on this cluster group. Please update/remove them before removing this group.', {'subCount':subCount}));
        }

        const clusterIds = await models.Cluster.distinct('cluster_id', { org_id: org_id, 'groups.uuid': group.uuid });
        if(clusterIds.length > 0){
          throw new ValidationError(context.req.t('{{clusterCount}} clusters depend on this group. Please update/remove the group from the clusters.', {'clusterCount':clusterIds.length}));
        }

        logger.info({req_id, user, org_id, name}, `${queryName} saving`);

        if(clusterIds && clusterIds.length > 0) {
          await groupResolvers.Mutation.unGroupClusters(parent, {orgId: org_id, uuid: group.uuid, clusters: clusterIds}, context);
        }

        await models.Group.deleteOne({ org_id: org_id, uuid: group.uuid });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        // Allow graphQL plugins to retrieve more information. removeGroupByName can delete a group. Include details of each deleted resource in pluginContext.
        context.pluginContext = {group: {name: group.name, uuid: group.uuid}};

        logger.info({req_id, user, org_id, name}, `${queryName} returning`);
        return {
          uuid: group.uuid,
          success: true,
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

    assignClusterGroups: async(
      parent,
      { orgId: org_id, groupUuids, clusterIds },
      context,
      fullQuery // eslint-disable-line no-unused-vars
    )=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'assignClusterGroups';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        groupUuids.forEach( value => { validateString( 'groupUuids', value ); } );
        clusterIds.forEach( value => validateString( 'clusterIds', value ) );

        const groups = await getAllowedResources(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, null, groupUuids);
        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} retrieved allowed resources`);

        if (groups.length != groupUuids.length) {
          throw new NotFoundError(context.req.t('One or more of the passed group uuids were not found'));
        }

        if (groups.length < 1) { throw new NotFoundError(context.req.t('None of the passed group uuids were found')); }

        let allAllowedClusters = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowedClusters = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id, groupUuids, clusterIds, allAllowedClusters}, `${queryName} validating - allAllowed: ${allAllowedClusters}`);

        let foundClusters = await commonClusterSearch(models, {org_id}, { limit: 0, skip: 0, startingAfter: null });
        foundClusters = foundClusters.filter(cluster => clusterIds.includes(cluster.cluster_id));

        if (!allAllowedClusters){
          foundClusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, foundClusters, context);
          logger.info({req_id, user, org_id}, `${queryName} filtered resources to allowed`);
        }

        if(!clusterIds.length){
          throw new ValidationError(context.req.t('No cluster uuids were passed', {'clusterIds':clusterIds}), context);
        }
        if (foundClusters.length != clusterIds.length) {
          throw new NotFoundError(context.req.t('One or more of the clusters was not found', {'clusters':foundClusters}), context);
        }

        groupUuids = _.map(groups, 'uuid');

        // Create output for graphQL plugins
        const groupObjsToAdd = _.map(groups, (group)=>{
          return {
            name: group.name,
            uuid: group.uuid,
          };
        });
        const clusterObjs = _.map(foundClusters, (cluster)=>{
          return {
            name: cluster.registration.name,
            uuid: cluster.cluster_id,
            registration: cluster.registration
          };
        });

        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} saving`);

        // because we cant do $addToSet with objs as inputs, we'll need to split into two queries
        // first we pull out all groups with matching uuids
        // then we insert the group objs
        // the end result is we have all the input groups inserted while also not having any duplicates
        // overall its bad to do this in two queries due to the second query potentially failing after the first one removes items, but i cant think of a better way
        // if we ever change the schema for this to just be a list of group ids, we can swap over to $addToSet and only need one query
        const ops = [
          {
            updateMany: {
              filter: {
                org_id,
                cluster_id: { $in: clusterIds },
              },
              update: {
                $pull: { groups: { uuid: { $in: groupUuids } } },
              },
            }
          },
          {
            updateMany: {
              filter: {
                org_id,
                cluster_id: { $in: clusterIds },
              },
              update: {
                $push: { groups: { $each: groupObjsToAdd } },
              },
            }
          }
        ];
        const res = await models.Cluster.collection.bulkWrite(ops, { ordered: true });

        pubSub.channelSubChangedFunc({org_id}, context);

        /*
        Trigger RBAC Sync after successful Group (Cluster) update and pubSub.
        RBAC Sync completes asynchronously, so no `await`.
        Even if RBAC Sync errors, Group (Cluster) update is successful.
        */
        groupsRbacSync( groups, { resync: false }, context ).catch(function(){/*ignore*/});

        // Allow graphQL plugins to retrieve more information. assignClusterGroups can assign groups. Include details of each assigned resource in pluginContext.
        context.pluginContext = {clusters: clusterObjs, groups: groupObjsToAdd};

        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} returning`);
        return {
          modified: res.modifiedCount
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

    unassignClusterGroups: async(
      parent,
      { orgId: org_id, groupUuids, clusterIds },
      context,
      fullQuery // eslint-disable-line no-unused-vars
    )=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'unassignClusterGroups';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        groupUuids.forEach( value => { validateString( 'groupUuids', value ); } );
        clusterIds.forEach( value => validateString( 'clusterIds', value ) );

        let groups = await getAllowedResources(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, null, groupUuids);
        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} retrieved allowed resources`);

        if (groups.length != groupUuids.length) {
          throw new NotFoundError(context.req.t('One or more of the passed group uuids were not found'));
        }

        if (groups.length < 1) { throw new NotFoundError(context.req.t('None of the passed group uuids were found')); }

        let allAllowedClusters = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowedClusters = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id, groupUuids, clusterIds, allAllowedClusters}, `${queryName} validating - allAllowed: ${allAllowedClusters}`);

        let clusters = await commonClusterSearch(models, {org_id}, { limit: 0, skip: 0, startingAfter: null });
        clusters = clusters.filter(cluster => clusterIds.includes(cluster.cluster_id));

        if (!allAllowedClusters){
          clusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, clusters, context);
          logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} filtered resources to allowed`);
        }

        /*
        Note: If some (but not all) of the passed clusters are not found or not authorized, the code will continue and ungroup the remainder.  The response will indicate how many were modified.
        */
        // Create output for graphQL plugins
        const clusterObjs = _.map(clusters, (cluster)=>{
          return {
            name: cluster.registration.name,
            uuid: cluster.cluster_id,
            registration: cluster.registration
          };
        });

        // Create group output for graphQL plugins
        const groupObjs = _.map(groups, (group)=>{
          return {
            name: group.name,
            uuid: group.uuid,
          };
        });

        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} saving`);

        const clusterIdsToUngroup = clusters.map( c => c.cluster_id );

        // removes items from the cluster.groups field that have a uuid in the passed groupUuids array
        const res = await models.Cluster.updateMany(
          {
            org_id,
            cluster_id: { $in: clusterIdsToUngroup },
          },
          {
            $pull: { groups: { uuid: { $in: groupUuids } } },
          }
        );

        pubSub.channelSubChangedFunc({org_id}, context);

        // Allow graphQL plugins to retrieve more information. unassignClusterGroups can unassign items in cluster groups. Include details of the unassigned resources in pluginContext.
        context.pluginContext = {clusters: clusterObjs, groups: groupObjs};

        logger.info({req_id, user, org_id, groupUuids, clusterIds}, `${queryName} returning`);
        return {
          modified: res.modifiedCount
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

    editClusterGroups: async(
      parent,
      { orgId: org_id, clusterId, groupUuids },
      context,
      fullQuery // eslint-disable-line no-unused-vars
    )=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editClusterGroups';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, clusterId, groupUuids}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateString( 'clusterId', clusterId );
        groupUuids.forEach( value => validateString( 'groupUuids', value ) );

        const groups = await getAllowedResources(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, null, groupUuids);
        logger.info({req_id, user, org_id, clusterId, groupUuids}, `${queryName} retrieved allowed resources`);

        if (groups.length != groupUuids.length) {
          throw new NotFoundError(context.req.t('One or more of the passed group uuids were not found'));
        }

        if (groups.length < 1) { throw new NotFoundError(context.req.t('None of the passed group uuids were found')); }

        groupUuids = _.map(groups, 'uuid');

        let cluster = await models.Cluster.findOne({
          org_id,
          cluster_id: clusterId
        }).lean({ virtuals: true });
        logger.info({req_id, user, org_id, clusterId, groupUuids}, `${queryName} validating - found: ${!!cluster}`);

        const identifiers = cluster ? [clusterId, cluster.registration.name || cluster.name] : [clusterId];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context, identifiers);
        logger.info({req_id, user, org_id, clusterId, groupUuids}, `${queryName} validating - cluster authorized`);

        // Create output for graphQL plugins
        const groupObjsToAdd = _.map(groups, (group)=>{
          return {
            uuid: group.uuid,
            name: group.name,
          };
        });
        const clusterObjs = {
          name: cluster.registration.name,
          uuid: cluster.cluster_id,
          registration: cluster.registration
        };

        const sets = {
          groups: groupObjsToAdd,
          updated: Date.now(),
        };

        logger.info({req_id, user, org_id, groupUuids, clusterId}, `${queryName} saving`);

        const res = await models.Cluster.updateOne({ org_id, cluster_id: clusterId }, { $set: sets });

        pubSub.channelSubChangedFunc({org_id}, context);

        /*
        Trigger RBAC Sync after successful Group (Cluster) update and pubSub.
        RBAC Sync completes asynchronously, so no `await`.
        Even if RBAC Sync errors, Group (Cluster) update is successful.

        Ideally, code should identify which groups are *new* for this cluster and only trigger sync for those.
        */
        groupsRbacSync( groups, { resync: false }, context ).catch(function(){/*ignore*/});

        // Allow graphQL plugins to retrieve more information. editClusterGroups can edit items in cluster groups. Include details of the edited resources in pluginContext.
        context.pluginContext = {cluster: clusterObjs, groups: groupObjsToAdd};

        logger.info({req_id, user, org_id, groupUuids, clusterId}, `${queryName} returning`);
        return {
          modified: res.modifiedCount
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

    groupClusters: async (parent, { orgId: org_id, uuid, clusters }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'groupClusters';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateString( 'uuid', uuid );
        clusters.forEach( value => validateString( 'clusters', value ) );

        const group = await models.Group.findOne({ org_id: org_id, uuid });
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating - found: ${!!group}`);

        const identifiers = group ? [uuid, group.name] : [uuid];
        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, identifiers);
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating - authorized`);

        if (!group) {
          throw new NotFoundError(context.req.t('group uuid "{{uuid}}" not found', {'uuid':uuid}), context);
        }

        let allAllowed = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowed = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating - allAllowed: ${allAllowed}`);

        let foundClusters = await commonClusterSearch(models, {org_id}, { limit: 0, skip: 0, startingAfter: null });
        foundClusters = foundClusters.filter(cluster => clusters.includes(cluster.cluster_id));

        if (!allAllowed) {
          foundClusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, foundClusters, context);
          logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} filtered resources to allowed`);
        }

        if(!clusters.length){
          throw new ValidationError(context.req.t('No clusters were passed', {'clusters':clusters}), context);
        }
        if (foundClusters.length != clusters.length) {
          throw new NotFoundError(context.req.t('One or more of the clusters was not found', {'clusters':clusters}), context);
        }

        // Create output for graphQL plugins
        const clusterObjs = _.map(foundClusters, (cluster)=>{
          return {
            name: cluster.registration.name,
            uuid: cluster.cluster_id,
            registration: cluster.registration
          };
        });

        // update clusters group array with the above group
        const res = await models.Cluster.updateMany(
          {org_id: org_id, cluster_id: {$in: clusters}, 'groups.uuid': {$nin: [uuid]}},
          {$push: {groups: {uuid: group.uuid, name: group.name}}});

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        /*
        Trigger RBAC Sync after successful Group (Cluster) update and pubSub.
        RBAC Sync completes asynchronously, so no `await`.
        Even if RBAC Sync errors, Group (Cluster) update is successful.

        Ideally, code should identify which groups are *new* for this cluster and only trigger sync for those.
        */
        groupsRbacSync( [group], { resync: false }, context ).catch(function(){/*ignore*/});

        // Allow graphQL plugins to retrieve more information. groupClusters can group items in cluster groups. Include details of the grouped resources in pluginContext.
        context.pluginContext = {clusters: clusterObjs, group: {name: group.name, uuid: group.uuid}};

        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} returning`);
        return {modified: res.modifiedCount };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    unGroupClusters: async (parent, { orgId: org_id, uuid, clusters }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'unGroupClusters';

      const user = whoIs(me);

      try {
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateString( 'uuid', uuid );
        clusters.forEach( value => validateString( 'clusters', value ) );

        // validate the group exits in the db first.
        const group = await models.Group.findOne({ org_id: org_id, uuid });
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating - found: ${!!group}`);

        const identifiers = group ? [uuid, group.name] : [uuid];
        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, identifiers);
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating - authorized`);

        if (!group) {
          throw new NotFoundError(context.req.t('group uuid "{{uuid}}" not found', {'uuid':uuid}), context);
        }

        let allAllowed = false;
        try {
          await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context);
          allAllowed = true;
        }
        catch(e){ // If exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
        }
        logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} validating - allAllowed: ${allAllowed}`);

        let foundClusters = await commonClusterSearch(models, {org_id}, { limit: 0, skip: 0, startingAfter: null });
        foundClusters = foundClusters.filter(cluster => clusters.includes(cluster.cluster_id));

        if (!allAllowed){
          foundClusters = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.CLUSTER, foundClusters, context);
          logger.info({req_id, user, org_id, uuid, clusters}, `${queryName} filtered resources to allowed`);
        }

        /*
        Note: If some (but not all) of the passed clusters are not found or not authorized, the code will continue and ungroup the remainder.  The response will indicate how many were modified.
        */
        // Create output for graphQL plugins
        const clusterObjs = _.map(foundClusters, (cluster)=>{
          return {
            name: cluster.registration.name,
            uuid: cluster.cluster_id,
            registration: cluster.registration
          };
        });

        const clusterIdsToUngroup = foundClusters.map( c => c.cluster_id );

        // update clusters group array with the above group
        const res = await models.Cluster.updateMany(
          {org_id: org_id, cluster_id: {$in: clusterIdsToUngroup}, 'groups.uuid': {$in: [uuid]}},
          {$pull: {groups: {uuid}}});

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        // Allow graphQL plugins to retrieve more information. unGroupClusters can ungroup items in cluster groups. Include details of the ungrouped resources in pluginContext.
        context.pluginContext = {clusters: clusterObjs, group: {name: group.name, uuid: group.uuid}};

        logger.info({req_id, user, org_id, uuid, clusters, group}, `${queryName} returning`);
        return {modified: res.modifiedCount };
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
};

module.exports = groupResolvers;
