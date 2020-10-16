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
const { withFilter } = require('apollo-server');
const { ACTIONS, TYPES, SUBSCRIPTION_LIMITS } = require('../models/const');
const {
  whoIs, validAuth, validClusterAuth,
  getGroupConditions, getAllowedGroups, filterSubscriptionsToAllowed,
  NotFoundError, BasicRazeeError, RazeeValidationError, RazeeQueryError, RazeeForbiddenError
} = require ('./common');
const getSubscriptionUrls = require('../../utils/subscriptions.js').getSubscriptionUrls;
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');
const GraphqlFields = require('graphql-fields');
const { applyQueryFieldsToSubscriptions } = require('../utils/applyQueryFields');

const pubSub = GraphqlPubSub.getInstance();

async function validateGroups(org_id, groups, context) {
  const { req_id, me, models, logger } = context;
  // validate cluster groups exists in the groups db
  let groupCount = await models.Group.count({org_id: org_id, name: {$in: groups} });
  if (groupCount < groups.length) {
    if (process.env.LABEL_VALIDATION_REQUIRED) {
      throw new RazeeValidationError(`Could not find all the cluster groups ${groups} in the groups database, please create them first.`, context);
    } else {
      // in migration period, we automatically populate groups into label db
      logger.info({req_id, user: whoIs(me), org_id}, `could not find all the cluster groups ${groups}, migrate them into label database.`);
      await models.Group.findOrCreateList(models, org_id, groups, context);
      groupCount = await models.Group.count({org_id: org_id, name: {$in: groups} });
    }
  }
  logger.debug({req_id, user: whoIs(me), groups, org_id, groupCount}, 'validateGroups');
  return groupCount;
}



const subscriptionResolvers = {
  Query: {

    // Cluster-facing API,
    subscriptionsByClusterId: async(parent, { clusterId: cluster_id, /* may add some unique data from the cluster later for verification. */ }, context) => {
      const { req_id, me, models, logger } = context;
      const query = 'subscriptionsByClusterId';
      logger.debug({req_id, user: whoIs(me), cluster_id,}, `${query} enter`);
      await validClusterAuth(me, query, context);

      const org = await models.User.getOrg(models, me);
      if(!org) {
        logger.error('An org was not found for this razee-org-key');
        throw new RazeeValidationError('org id was not found', context);
      }
      const org_id = org._id;

      const cluster = await models.Cluster.findOne({org_id, cluster_id}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeValidationError(`Could not locate the cluster with cluster_id ${cluster_id}`, context);
      }
      var clusterGroupNames = [];
      if (cluster.groups) {
        clusterGroupNames = cluster.groups.map(l => l.name);
      }

      logger.debug({user: 'graphql api user', org_id, clusterGroupNames }, `${query} enter`);
      let urls = [];
      try {
        // Return subscriptions that contain any clusterGroupNames passed in from the query
        // examples:
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod', 'stage'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['stage'] ==> false
        var foundSubscriptions = await models.Subscription.find({
          'org_id': org_id,
          groups: { $in: clusterGroupNames },
        }).lean(/* skip virtuals: true for now since it is class facing api. */);
        foundSubscriptions = await filterSubscriptionsToAllowed(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, foundSubscriptions, context);
        _.each(foundSubscriptions, (sub)=>{
          if(_.isUndefined(sub.channelName)){
            sub.channelName = sub.channel;
          }
        });
        if(foundSubscriptions && foundSubscriptions.length > 0 ) {
          urls = await getSubscriptionUrls(org_id, foundSubscriptions);
        }
      } catch (error) {
        logger.error(error, `There was an error getting ${query} from mongo`);
      }
      return urls;
    },
    subscriptions: async(parent, { orgId: org_id }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptions';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      // await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context);
      const conditions = await getGroupConditions(me, org_id, ACTIONS.READ, 'name', queryName, context);
      logger.debug({req_id, user: whoIs(me), org_id, conditions }, `${queryName} group conditions are...`);
      try{
        var subscriptions = await models.Subscription.find({ org_id, ...conditions }, {}).lean({ virtuals: true });
        subscriptions = await filterSubscriptionsToAllowed(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, subscriptions, context);
      }catch(err){
        logger.error(err);
        throw new NotFoundError('Could not find the subscription.', context);
      }
      // render owner information if users ask for
      if(queryFields.owner && subscriptions) {
        const ownerIds = _.map(subscriptions, 'owner');
        const owners = await models.User.getBasicUsersByIds(ownerIds);

        subscriptions = subscriptions.map((sub)=>{
          if(_.isUndefined(sub.channelName)){
            sub.channelName = sub.channel;
          }
          sub.owner = owners[sub.owner];
          return sub;
        });
      }

      await applyQueryFieldsToSubscriptions(subscriptions, queryFields, { orgId: org_id }, context);

      return subscriptions;
    },
    subscription: async(parent, { orgId, uuid , name, _queryName }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = _queryName ? `${_queryName}/subscription` : 'subscription';
      logger.debug({req_id, user: whoIs(me), org_id: orgId, uuid, name }, `${queryName} enter`);

      try{
        var subscriptions = await subscriptionResolvers.Query.subscriptions(parent, { orgId }, { models, me, req_id, logger }, fullQuery);
        subscriptions = await filterSubscriptionsToAllowed(me, orgId, ACTIONS.READ, TYPES.SUBSCRIPTION, subscriptions, context);

        var subscription = subscriptions.find((sub)=>{
          return (sub.uuid == uuid || sub.name == name);
        });
        if(!subscription){
          return null;
        }

        await applyQueryFieldsToSubscriptions([subscription], queryFields, { orgId }, context);

        return subscription;
      }catch(err){
        logger.error(err);
        throw new RazeeQueryError(`Query ${queryName} error. ${err.message}`, context);
      
      }
    },
    subscriptionByName: async(parent, { orgId, name }, context, fullQuery) => {
      const { me, req_id, logger } = context;
      const queryName = 'subscriptionByName';
      logger.debug({req_id, user: whoIs(me), org_id: orgId , name }, `${queryName} enter`);
      return await subscriptionResolvers.Query.subscription(parent, { orgId , name, _queryName: queryName }, context, fullQuery);
    },

    subscriptionsForCluster: async(parent, {  orgId: org_id , clusterId: cluster_id  }, context, fullQuery) => {
      
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptionsForCluster';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      
      //find groups in cluster
      const cluster = await models.Cluster.findOne({org_id, cluster_id}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeValidationError(`Could not locate the cluster with cluster_id ${cluster_id}`, context);
      }
      var clusterGroupNames = [];
      if (cluster.groups) {
        clusterGroupNames = cluster.groups.map(l => l.name);
      }
      const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.READ, 'name', queryName, context);
      if (clusterGroupNames) {
        clusterGroupNames.some(group => {
          if(allowedGroups.indexOf(group) === -1) {
            // if some group of the sub is not in user's group list, throws an error
            throw new RazeeForbiddenError(`You are not allowed to read subscriptions due to missing permissions on cluster group ${group.name}.`, context);
          }
          return false;
        });
      }
      try{
        // Return subscriptions that contain any clusterGroupNames passed in from the query
        // examples:
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod', 'stage'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['stage'] ==> false
        var subscriptions = await models.Subscription.find({org_id, groups: { $in: clusterGroupNames },}).lean({ virtuals: true });
        subscriptions = await filterSubscriptionsToAllowed(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, subscriptions, context);
      }catch(err){
        logger.error(err);
        throw new NotFoundError('Could not find subscriptions.', context); 
      }
      if(subscriptions) {
        subscriptions = subscriptions.map((sub)=>{
          if(_.isUndefined(sub.channelName)){
            sub.channelName = sub.channel;
          }
          return sub;
        });
      }

      await applyQueryFieldsToSubscriptions(subscriptions, queryFields, { orgId: org_id }, context);

      return subscriptions;
    },
    
    subscriptionsForClusterByName: async(parent, {  orgId: org_id, clusterName  }, context, fullQuery) => {

      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptionsForClusterByName';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      
      //find groups in cluster
      const cluster = await models.Cluster.findOne({org_id, 'registration.name': clusterName}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeValidationError(`Could not locate the cluster with clusterName ${clusterName}`, context);
      }
      var clusterGroupNames = [];
      if (cluster.groups) {
        clusterGroupNames = cluster.groups.map(l => l.name);
      }
      const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.READ, 'name', queryName, context);
      if (clusterGroupNames) {
        clusterGroupNames.some(group => {
          if(allowedGroups.indexOf(group) === -1) {
            // if some group of the sub is not in user's group list, throws an error
            throw new RazeeForbiddenError(`You are not allowed to read subscriptions due to missing permissions on cluster group ${group.name}.`, context);
          }
          return false;
        });
      }

      try{
        // Return subscriptions that contain any clusterGroupNames passed in from the query
        // examples:
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod', 'stage'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['stage'] ==> false
        var subscriptions = await models.Subscription.find({org_id, groups: { $in: clusterGroupNames },}).lean({ virtuals: true });
        subscriptions = await filterSubscriptionsToAllowed(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, subscriptions, context);
      }catch(err){
        logger.error(err);
        throw new NotFoundError('Could not find subscriptions.', context); 
      }
      if(subscriptions) {
        subscriptions = subscriptions.map((sub)=>{
          if(_.isUndefined(sub.channelName)){
            sub.channelName = sub.channel;
          }
          return sub;
        });
      }

      await applyQueryFieldsToSubscriptions(subscriptions, queryFields, { orgId: org_id }, context);

      return subscriptions;
    }
  },
  Mutation: {
    addSubscription: async (parent, { orgId: org_id, name, groups, channelUuid: channel_uuid, versionUuid: version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.CREATE, TYPES.SUBSCRIPTION, queryName, context);

      try{
        // validate the number of total subscriptions are under the limit
        const total = await models.Subscription.count({org_id});
        if (total >= SUBSCRIPTION_LIMITS.MAX_TOTAL ) {
          throw new RazeeValidationError(`Too many subscriptions are registered under ${org_id}.`, context);
        }

        const uuid = UUID();

        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        if(!channel){
          throw new NotFoundError(`channel uuid "${channel_uuid}" not found`, context);
        }

        // validate groups are all exists in label dbs
        await validateGroups(org_id, groups, context);

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw  new NotFoundError(`version uuid "${version_uuid}" not found`, context);
        }

        await models.Subscription.create({
          _id: UUID(),
          uuid, org_id, name, groups, owner: me._id,
          channelName: channel.name, channel_uuid, version: version.name, version_uuid
        });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        return {
          uuid,
        };
      }
      catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(`Query ${queryName} error. ${err.message}`, context);
      }
    },
    editSubscription: async (parent, { orgId, uuid, name, groups, channelUuid: channel_uuid, versionUuid: version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editSubscription';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);
      // await validAuth(me, orgId, ACTIONS.UPDATE, TYPES.SUBSCRIPTION, queryName, context);

      try{
        var subscription = await models.Subscription.findOne({ org_id: orgId, uuid });
        if(!subscription){
          throw  new NotFoundError(`Subscription { uuid: "${uuid}", orgId:${orgId} } not found.`, context);
        }

        await validAuth(me, orgId, ACTIONS.UPDATE, TYPES.SUBSCRIPTION, queryName, context, [subscription.uuid, subscription.name]);

        // loads the channel
        var channel = await models.Channel.findOne({ org_id: orgId, uuid: channel_uuid });
        if(!channel){
          throw  new NotFoundError(`Channel uuid "${channel_uuid}" not found.`, context);
        }

        // validate groups are all exists in label dbs
        await validateGroups(orgId, groups, context);
        
        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw  new NotFoundError(`Version uuid "${version_uuid}" not found.`, context);
        }

        var sets = {
          name, groups,
          channelName: channel.name, channel_uuid, version: version.name, version_uuid,
        };
        await models.Subscription.updateOne({ uuid, org_id: orgId, }, { $set: sets });

        pubSub.channelSubChangedFunc({ org_id: orgId }, context);

        return {
          uuid,
          success: true,
        };
      }
      catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(`Query ${queryName} error. ${err.message}`, context);
      }
    },
    setSubscription: async (parent, { orgId: org_id, uuid, versionUuid: version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'setSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      // await validAuth(me, org_id, ACTIONS.SETVERSION, TYPES.SUBSCRIPTION, queryName, context);

      try{
        var subscription = await models.Subscription.findOne({ org_id, uuid });
        if(!subscription){
          throw  new NotFoundError(`Subscription { uuid: "${uuid}", org_id:${org_id} } not found.`, context);
        }

        // this may be overkill, but will check for strings first, then groups below
        await validAuth(me, org_id, ACTIONS.SETVERSION, TYPES.SUBSCRIPTION, queryName, context, [subscription.uuid, subscription.name]);

        // validate user has enough cluster groups permissions to for this sub
        // TODO: we should use specific groups action below instead of manage, e.g. setSubscription action
        const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.SETVERSION, 'name', queryName, context);
        if (subscription.groups.some(t => {return allowedGroups.indexOf(t) === -1;})) {
          // if some tag of the sub does not in user's cluster group list, throws an error
          throw new RazeeForbiddenError(`You are not allowed to set subscription for all of ${subscription.groups} groups.`, context);
        }
        
        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: subscription.channel_uuid });
        if(!channel){
          throw new NotFoundError(`Channel uuid "${subscription.channel_uuid}" not found.`, context);
        }

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw new NotFoundError(`Version uuid "${version_uuid}" not found.`, context);
        }

        var sets = {
          version: version.name, version_uuid,
        };
        await models.Subscription.updateOne({ uuid, org_id }, { $set: sets });

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        return {
          uuid,
          success: true,
        };
      }
      catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(`Query ${queryName} error. ${err.message}`, context);
      }
    },

    removeSubscription: async (parent, { orgId: org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.DELETE, TYPES.SUBSCRIPTION, queryName, context);

      var success = false;
      try{
        var subscription = await models.Subscription.findOne({ org_id, uuid });
        if(!subscription){
          throw  new NotFoundError(`Subscription uuid "${uuid}" not found.`, context);
        }

        await validAuth(me, org_id, ACTIONS.DELETE, TYPES.SUBSCRIPTION, queryName, context, [subscription.uuid, subscription.name]);

        await subscription.deleteOne();

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        success = true;
      }catch(err){
        if ( err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(`Query ${queryName} error. ${err.message}`, context);
      }
      return {
        uuid, success,
      };
    },
  },

  Subscription: {
    subscriptionUpdated: {
      // eslint-disable-next-line no-unused-vars
      resolve: async (parent, args) => {
        //  
        // Sends a message back to a subscribed client
        // 'parent' is the object representing the subscription that was updated
        // 
        return { hasUpdates: true };
      },

      subscribe: withFilter(
        // eslint-disable-next-line no-unused-vars
        (parent, args, context) => {
          //  
          //  This function runs when a client initially connects
          // 'args' contains the razee-org-key sent by a connected client
          // 
          const { logger } = context;

          const orgKey = context.apiKey || '';
          if (!orgKey) {
            logger.error('No razee-org-key was supplied');
            throw new RazeeValidationError('No razee-org-key was supplied.', context);
          }

          const orgId = context.orgId || '';
          if (!orgId) {
            logger.error('No org was found for this org key');
            throw new RazeeValidationError('No org was found for the org key.', context);
          }

          const topic = getStreamingTopic(EVENTS.CHANNEL.UPDATED, orgId);
          logger.info({org_id: orgId, topic}, 'post subscription update notification to redis.');
          return GraphqlPubSub.getInstance().pubSub.asyncIterator(topic);
        },
        // eslint-disable-next-line no-unused-vars
        async (parent, args, context) => {
          // 
          // this function determines whether or not to send data back to a subscriber
          //
          const { logger } = context;
          let found = true;

          logger.info('Verify client is authenticated and orgId matches the updated subscription orgId');
          const { subscriptionUpdated } = parent;

          const orgKey = context.apiKey || '';
          if (!orgKey) {
            logger.error('No razee-org-key was supplied');
            return Boolean(false);
          }
          
          const orgId = context.orgId || '';
          if (!orgId) {
            logger.error('No org was found for this org key. returning false');
            return Boolean(false);
          }

          const orgIdInUpdated = subscriptionUpdated.data.org_id || subscriptionUpdated.data.orgId;
          if(orgIdInUpdated !== orgId) {
            logger.error('wrong org id for this subscription. returning false');
            found = false;
          }
          logger.info(`Updated subscription returning ${found} for org_id: ${orgId}`);
          return Boolean(found);
        },
      ),
    },
  },
};

module.exports = subscriptionResolvers;
