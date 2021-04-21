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

const _ = require('lodash');
const { v4: UUID } = require('uuid');
const {  ValidationError } = require('apollo-server');

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth, NotFoundError } = require ('./common');
const { GraphqlPubSub } = require('../subscription');
const GraphqlFields = require('graphql-fields');
const { applyQueryFieldsToGroups } = require('../utils/applyQueryFields');

const pubSub = GraphqlPubSub.getInstance();

const groupResolvers = {
  Query: {
    groups: async(parent, { orgId }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'groups';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);
      await validAuth(me, orgId, ACTIONS.READ, TYPES.GROUP, queryName, context);
      let groups;
      try{
        groups = await models.Group.find({ org_id: orgId }).lean({ virtuals: true });

        await applyQueryFieldsToGroups(groups, queryFields, { orgId }, context);

        return groups;
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
    group: async(parent, { orgId, uuid }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'group';
      logger.debug({req_id, user: whoIs(me), orgId, uuid}, `${queryName} enter`);
      // await validAuth(me, orgId, ACTIONS.READ, TYPES.GROUP, queryName, context);

      try{
        let group = await models.Group.findOne({ org_id: orgId, uuid }).lean({ virtuals: true });
        if (!group) {
          throw new NotFoundError(context.req.t('could not find group with uuid {{uuid}}.', {'uuid':uuid}), context);
        }
        await validAuth(me, orgId, ACTIONS.READ, TYPES.GROUP, queryName, context, [group.uuid, group.name]);
        await applyQueryFieldsToGroups([group], queryFields, { orgId }, context);

        return group;
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
    groupByName: async(parent, { orgId, name }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'groupByName';
      logger.debug({req_id, user: whoIs(me), orgId, name}, `${queryName} enter`);
      // await validAuth(me, orgId, ACTIONS.READ, TYPES.GROUP, queryName, context);

      try{
        let group = await models.Group.findOne({ org_id: orgId, name }).lean({ virtuals: true });
        if (!group) {
          throw new NotFoundError(context.req.t('could not find group with name {{name}}.', {'name':name}));
        }
        await validAuth(me, orgId, ACTIONS.READ, TYPES.GROUP, queryName, context, [group.uuid, group.name]);

        await applyQueryFieldsToGroups([group], queryFields, { orgId }, context);

        return group;
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
  },
  Mutation: {
    addGroup: async (parent, { orgId: org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addGroup';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try {
        // might not necessary with unique index. Worth to check to return error better.
        const group = await models.Group.findOne({ org_id: org_id, name });
        if(group){
          throw new ValidationError(context.req.t('The group name {{name}} already exists.', {'name':name}));
        }
        const uuid = UUID();
        await models.Group.create({
          _id: UUID(),
          uuid, org_id: org_id, name, owner: me._id,
        });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        return {
          uuid,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    removeGroup: async (parent, { orgId: org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeGroup';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try{
        const group = await models.Group.findOne({ uuid, org_id: org_id }).lean();
        if(!group){
          throw new NotFoundError(context.req.t('group uuid "{{uuid}}" not found', {'uuid':uuid}));
        }

        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, [group.uuid, group.name]);
        const subCount = await models.Subscription.count({ org_id: org_id, groups: group.name });

        if(subCount > 0){
          throw new ValidationError(context.req.t('{{subCount}} subscriptions depend on this cluster group. Please update/remove them before removing this group.', {'subCount':subCount}));
        }

        const clusterIds = await models.Cluster.distinct('cluster_id', { org_id: org_id, 'groups.uuid': group.uuid });
        if(clusterIds && clusterIds.length > 0) {
          await groupResolvers.Mutation.unGroupClusters(parent, {orgId: org_id, uuid, clusters: clusterIds}, context);
        }

        await models.Group.deleteOne({ org_id: org_id, uuid:group.uuid });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        return {
          uuid: group.uuid,
          success: true,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    removeGroupByName: async (parent, { orgId: org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeGroupByName';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try{
        const group = await models.Group.findOne({ name, org_id: org_id }).lean();
        if(!group){
          throw new NotFoundError(context.req.t('group name "{{name}}" not found', {'name':name}));
        }

        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, [group.uuid, group.name]);

        const subCount = await models.Subscription.count({ org_id: org_id, groups: group.name });
        if(subCount > 0){
          throw new ValidationError(context.req.t('{{subCount}} subscriptions depend on this cluster group. Please update/remove them before removing this group.', {'subCount':subCount}));
        }

        const uuid = group.uuid;
        const clusterIds = await models.Cluster.distinct('cluster_id', { org_id: org_id, 'groups.uuid': group.uuid });
        if(clusterIds && clusterIds.length > 0) {
          await groupResolvers.Mutation.unGroupClusters(parent, {orgId: org_id, uuid, clusters: clusterIds}, context);
        }

        const clusterCount = await models.Cluster.count({ org_id: org_id, 'groups.uuid': group.uuid });
        if(clusterCount > 0){
          throw new ValidationError(context.req.t('{{clusterCount}} clusters depend on this group. Please update/remove the group from the clusters.', {'clusterCount':clusterCount}));
        }

        await models.Group.deleteOne({ org_id: org_id, uuid:group.uuid });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        return {
          uuid: group.uuid,
          success: true,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    assignClusterGroups: async(
      parent,
      { orgId, groupUuids, clusterIds },
      context,
      fullQuery // eslint-disable-line no-unused-vars
    )=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'assignClusterGroups';
      logger.debug({ req_id, user: whoIs(me), groupUuids, clusterIds }, `${queryName} enter`);
      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try {
        var groups = await models.Group.find({org_id: orgId, uuid: {$in: groupUuids}});
        if (groups.length < 1) {
          throw new NotFoundError(context.req.t('None of the passed group uuids were found'));
        }
        groupUuids = _.map(groups, 'uuid');
        var groupObjsToAdd = _.map(groups, (group)=>{
          return {
            uuid: group.uuid,
            name: group.name,
          };
        });
        // because we cant do $addToSet with objs as inputs, we'll need to split into two queries
        // first we pull out all groups with matching uuids
        // then we insert the group objs
        // the end result is we have all the input groups inserted while also not having any duplicates
        // overall its bad to do this in two queries due to the second query potentially failing after the first one removes items, but i cant think of a better way
        // if we ever change the schema for this to just be a list of group ids, we can swap over to $addToSet and only need one query
        var ops = [
          {
            updateMany: {
              filter: {
                org_id: orgId,
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
                org_id: orgId,
                cluster_id: { $in: clusterIds },
              },
              update: {
                $push: { groups: { $each: groupObjsToAdd } },
              },
            }
          }
        ];
        var res = await models.Cluster.collection.bulkWrite(ops, { ordered: true });

        logger.debug({ req_id, user: whoIs(me), groupUuids, clusterIds, res }, `${queryName} exit`);
        pubSub.channelSubChangedFunc({org_id: orgId}, context);
        return {
          modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified
        };
      }
      catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    unassignClusterGroups: async(
      parent,
      { orgId, groupUuids, clusterIds },
      context,
      fullQuery // eslint-disable-line no-unused-vars
    )=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'unassignClusterGroups';
      logger.debug({ req_id, user: whoIs(me), groupUuids, clusterIds }, `${queryName} enter`);
      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try {
        // removes items from the cluster.groups field that have a uuid in the passed groupUuids array
        var res = await models.Cluster.updateMany(
          {
            org_id: orgId,
            cluster_id: { $in: clusterIds },
          },
          {
            $pull: { groups: { uuid: { $in: groupUuids } } },
          }
        );

        logger.debug({ req_id, user: whoIs(me), groupUuids, clusterIds, res }, `${queryName} exit`);
        pubSub.channelSubChangedFunc({org_id: orgId}, context);
        return {
          modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified
        };
      }
      catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    editClusterGroups: async(
      parent,
      { orgId, clusterId, groupUuids },
      context,
      fullQuery // eslint-disable-line no-unused-vars
    )=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editClusterGroups';
      logger.debug({ req_id, user: whoIs(me), groupUuids, clusterId }, `${queryName} enter`);
      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try {
        var groups = await models.Group.find({ org_id: orgId, uuid: { $in: groupUuids } });
        if (groups.length != groupUuids.length) {
          throw new NotFoundError(context.req.t('One or more of the passed group uuids were not found'));
        }
        groupUuids = _.map(groups, 'uuid');
        var groupObjsToAdd = _.map(groups, (group)=>{
          return {
            uuid: group.uuid,
            name: group.name,
          };
        });
        var sets = {
          groups: groupObjsToAdd,
        };

        const res = await models.Cluster.updateOne({ org_id: orgId, cluster_id: clusterId }, { $set: sets });

        logger.debug({ req_id, user: whoIs(me), groupUuids, clusterId, res }, `${queryName} exit`);
        pubSub.channelSubChangedFunc({org_id: orgId}, context);
        return {
          modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified
        };
      }
      catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    groupClusters: async (parent, { orgId: org_id, uuid, clusters }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'groupClusters';
      logger.debug({ req_id, user: whoIs(me), uuid, clusters }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try{

        // validate the group exits in the db first.
        const group = await models.Group.findOne({ org_id: org_id, uuid });
        if(!group){
          throw new NotFoundError(context.req.t('group uuid "{{uuid}}" not found', {'uuid':uuid}));
        }

        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, [group.uuid, group.name]);

        // update clusters group array with the above group
        const res = await models.Cluster.updateMany(
          {org_id: org_id, cluster_id: {$in: clusters}, 'groups.uuid': {$nin: [uuid]}},
          {$push: {groups: {uuid: group.uuid, name: group.name}}});

        logger.debug({ req_id, user: whoIs(me), uuid, clusters, res }, `${queryName} exit`);
        pubSub.channelSubChangedFunc({org_id: org_id}, context);
        return {modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified };

      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    unGroupClusters: async (parent, { orgId: org_id, uuid, clusters }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'unGroupClusters';
      logger.debug({ req_id, user: whoIs(me), uuid, clusters }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context);

      try{

        // validate the group exits in the db first.
        const group = await models.Group.findOne({ org_id: org_id, uuid });
        if(!group){
          throw new NotFoundError(context.req.t('group uuid "{{uuid}}" not found', {'uuid':uuid}));
        }

        await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.GROUP, queryName, context, [group.uuid, group.name]);

        // update clusters group array with the above group
        const res = await models.Cluster.updateMany(
          {org_id: org_id, cluster_id: {$in: clusters}, 'groups.uuid': {$in: [uuid]}},
          {$pull: {groups: {uuid}}});

        logger.debug({ req_id, user: whoIs(me), uuid, clusters, res }, `${queryName} exit`);
        pubSub.channelSubChangedFunc({org_id: org_id}, context);
        return {modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified };

      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
  },
};

module.exports = groupResolvers;
