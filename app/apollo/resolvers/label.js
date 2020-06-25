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

const pubSub = GraphqlPubSub.getInstance();

const labelResolvers = {
  Query: {
    labels: async(parent, { org_id }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'labels';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.LABEL, queryName, context);
      var labels;
      try{
        labels = await models.Label.find({ org_id: org_id }).lean();
        var ownerIds = _.map(labels, 'owner');
        var owners = await models.User.getBasicUsersByIds(ownerIds);
  
        labels = labels.map((lb)=>{
          lb.owner = owners[lb.owner];
          return lb;
        });
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
      return labels;
    },
    label: async(parent, { org_id: org_id, uuid }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'label';
      logger.debug({req_id, user: whoIs(me), org_id, uuid}, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.LABEL, queryName, context);
  
      try{
        var label = await models.Label.findOne({ org_id: org_id, uuid }).lean();
        if (!label) {
          throw new NotFoundError(`could not find label with uuid ${uuid}.`);
        }
        var owners = await models.User.getBasicUsersByIds([label.owner]);

        const subscriptionCount = await models.Subscription.count({ org_id: org_id, tags: label.name });

        const clusterCount = await models.Cluster.count({ org_id: org_id, 'tags.uuid': label.uuid });

        label.owner = owners[label.owner];
        return {clusterCount, subscriptionCount, ...label};
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
    labelByName: async(parent, { org_id, name }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'labelByName';
      logger.debug({req_id, user: whoIs(me), org_id, name}, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.LABEL, queryName, context);
  
      try{
        var label = await models.Label.findOne({ org_id: org_id, name }).lean();
        if (!label) {
          throw new NotFoundError(`could not find label with name ${name}.`);
        }
        var owners = await models.User.getBasicUsersByIds([label.owner]);

        const subscriptionCount = await models.Subscription.count({ org_id: org_id, tags: label.name });

        const clusterCount = await models.Cluster.count({ org_id: org_id, 'tags.uuid': label.uuid });

        label.owner = owners[label.owner];
        return {clusterCount, subscriptionCount, ...label};
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },    
  },
  Mutation: {
    addLabel: async (parent, { org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addLabel';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.LABEL, queryName, context);
    
      try {
        // might not necessary with unique index. Worth to check to return error better.
        const label = await models.Label.findOne({ org_id: org_id, name });
        if(label){
          throw new ValidationError(`The label name ${name} already exists.`);
        }
        const uuid = UUID();
        await models.Label.create({
          _id: UUID(),
          uuid, org_id: org_id, name, owner: me._id,
        });

        pubSub.channelSubChangedFunc({org_id: org_id});

        return {
          uuid,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    removeLabel: async (parent, { org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeLabel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.LABEL, queryName, context);
  
      try{
        const label = await models.Label.findOne({ uuid, org_id: org_id }).lean();
        if(!label){
          throw new NotFoundError(`label uuid "${uuid}" not found`);
        }
  
        const subCount = await models.Subscription.count({ org_id: org_id, tags: label.name });
  
        if(subCount > 0){
          throw new ValidationError(`${subCount} subscriptions depend on this label. Please update/remove them before removing this label.`);
        }
        
        const clusterCount = await models.Cluster.count({ org_id: org_id, 'tags.uuid': label.uuid });
        if(clusterCount > 0){
          throw new ValidationError(`${clusterCount} clusters depend on this label. Please update/remove the label from the clusters.`);
        }      

        await models.Label.deleteOne({ org_id: org_id, uuid:label.uuid });

        pubSub.channelSubChangedFunc({org_id: org_id});
  
        return {
          uuid: label.uuid,
          success: true,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    removeLabelByName: async (parent, { org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeLabel';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.LABEL, queryName, context);
  
      try{
        const label = await models.Label.findOne({ name, org_id: org_id }).lean();
        if(!label){
          throw new NotFoundError(`label name "${name}" not found`);
        }
  
        const subCount = await models.Subscription.count({ org_id: org_id, tags: label.name });
        if(subCount > 0){
          throw new ValidationError(`${subCount} subscriptions depend on this label. Please update/remove them before removing this label.`);
        }
        
        const clusterCount = await models.Cluster.count({ org_id: org_id, 'tags.uuid': label.uuid });
        if(clusterCount > 0){
          throw new ValidationError(`${clusterCount} clusters depend on this label. Please update/remove the label from the clusters.`);
        }      

        await models.Label.deleteOne({ org_id: org_id, uuid:label.uuid });

        pubSub.channelSubChangedFunc({org_id: org_id});
  
        return {
          uuid: label.uuid,
          success: true,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    labelClusters: async (parent, { org_id, uuid, clusters }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'labelClusters';
      logger.debug({ req_id, user: whoIs(me), uuid, clusters }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.LABEL, queryName, context);

      try{

        // validate the label exits in the db first.
        const label = await models.Label.findOne({ org_id: org_id, uuid });
        if(!label){
          throw new NotFoundError(`label uuid "${uuid}" not found`);
        }

        // update clusters label array with the above label
        const res = await models.Cluster.updateMany(
          {org_id: org_id, cluster_id: {$in: clusters}, 'tags.uuid': {$nin: [uuid]}}, 
          {$push: {tags: {uuid: label.uuid, name: label.name}}});

        logger.debug({ req_id, user: whoIs(me), uuid, clusters, res }, `${queryName} exit`);
        pubSub.channelSubChangedFunc({org_id: org_id});
        return {modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified };
  
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },

    unlabelClusters: async (parent, { org_id, uuid, clusters }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'unlabelClusters';
      logger.debug({ req_id, user: whoIs(me), uuid, clusters }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.LABEL, queryName, context);

      try{

        // validate the label exits in the db first.
        const label = await models.Label.findOne({ org_id: org_id, uuid });
        if(!label){
          throw new NotFoundError(`label uuid "${uuid}" not found`);
        }

        // update clusters label array with the above label
        const res = await models.Cluster.updateMany(
          {org_id: org_id, cluster_id: {$in: clusters}, 'tags.uuid': {$in: [uuid]}}, 
          {$pull: {tags: {uuid}}});

        logger.debug({ req_id, user: whoIs(me), uuid, clusters, res }, `${queryName} exit`);
        pubSub.channelSubChangedFunc({org_id: org_id});
        return {modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified };
  
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
  },
};

module.exports = labelResolvers;
