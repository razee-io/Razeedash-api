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
const { withFilter, ValidationError } = require('apollo-server');
const { ForbiddenError } = require('apollo-server');
const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth, NotFoundError, validClusterAuth, getUserTagConditions, getUserTags } = require ('./common');
const getSubscriptionUrls = require('../../utils/subscriptions.js').getSubscriptionUrls;
const tagsStrToArr = require('../../utils/subscriptions.js').tagsStrToArr;
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');

const pubSub = GraphqlPubSub.getInstance();

async function validateTags(org_id, tags, context) {
  const { req_id, me, models, logger } = context;
  // validate tags are all exists in label dbs
  var labelCount = await models.Label.count({orgId: org_id, name: {$in: tags} });
  if (labelCount < tags.length) {
    if (process.env.LABEL_VALIDATION_REQUIRED) {
      throw new ValidationError(`could not find all the tags ${tags} in the label database, please create them first.`);
    } else {
      // in migration period, we automatically populate tags into label db
      logger.info({req_id, user: whoIs(me), org_id}, `could not find all the tags ${tags}, migrate them into label database.`);
      await models.Label.findOrCreateList(models, org_id, tags, context);
      labelCount = await models.Label.count({orgId: org_id, name: {$in: tags} });
    }
  }
  logger.debug({req_id, user: whoIs(me), tags, org_id, labelCount}, 'validateTags');
  return labelCount;
}

const subscriptionResolvers = {
  Query: {
    // Cluster-face API
    subscriptionsByTag: async(parent, { tags }, context) => {
      const { req_id, me, models, logger } = context;
      const query = 'subscriptionsByTag';
      logger.debug({req_id, user: whoIs(me), tags}, `${query} enter`);
      await validClusterAuth(me, query, context);

      const org = await models.User.getOrg(models, me);
      if(!org) {
        logger.error('An org was not found for this razee-org-key');
        throw new ForbiddenError('org id was not found');
      }
      const org_id = org._id;
      const userTags = tagsStrToArr(tags);

      if (process.env.LABEL_VALIDATION_REQUIRED) {
        throw new ValidationError('subscriptionsByTag is not supported, please migrate to subscriptionsByCluster api.');
      }
      await validateTags(org_id, userTags, context);

      let urls = [];
      try {
        // Return subscriptions where $tags stored in mongo are a subset of the userTags passed in from the query
        // examples:
        //   mongo tags: ['dev', 'prod'] , userTags: ['dev'] ==> false
        //   mongo tags: ['dev', 'prod'] , userTags: ['dev', 'prod'] ==> true
        //   mongo tags: ['dev', 'prod'] , userTags: ['dev', 'prod', 'stage'] ==> true
        //   mongo tags: ['dev', 'prod'] , userTags: ['stage'] ==> false
        const foundSubscriptions = await models.Subscription.aggregate([
          { $match: { 'org_id': org_id} },
          { $project: { name: 1, uuid: 1, tags: 1, version: 1, channel: 1, channel_name: 1, isSubSet: { $setIsSubset: ['$tags', userTags] } } },
          { $match: { 'isSubSet': true } }
        ]);
              
        if(foundSubscriptions && foundSubscriptions.length > 0 ) {
          urls = await getSubscriptionUrls(org_id, userTags, foundSubscriptions);
        }
      } catch (error) {
        logger.error(error, `There was an error getting ${query} from mongo`);
      }
      return urls;
    },
    // Cluster-face API
    subscriptionsByCluster: async(parent, { cluster_id, /* may add some unique data from the cluster later for verification. */ }, context) => {
      const { req_id, me, models, logger } = context;
      const query = 'subscriptionsByCluster';
      logger.debug({req_id, user: whoIs(me), cluster_id}, `${query} enter`);
      await validClusterAuth(me, query, context);

      const org = await models.User.getOrg(models, me);
      if(!org) {
        logger.error('An org was not found for this razee-org-key');
        throw new ForbiddenError('org id was not found');
      }
      const org_id = org._id;

      const cluster = await models.Cluster.findOne({org_id, cluster_id}).lean();
      if (!cluster) {
        throw new ValidationError(`could not locate the cluster with cluster_id ${cluster_id}`);
      }
      var userTags = [];
      if (cluster.labels) {
        userTags = cluster.labels.map(l => l.name);
      }
      logger.debug({user: 'graphql api user', org_id, userTags }, `${query} enter`);
      let urls = [];
      try {
        // Return subscriptions where $tags stored in mongo are a subset of the userTags passed in from the query
        // examples:
        //   mongo tags: ['dev', 'prod'] , userTags: ['dev'] ==> false
        //   mongo tags: ['dev', 'prod'] , userTags: ['dev', 'prod'] ==> true
        //   mongo tags: ['dev', 'prod'] , userTags: ['dev', 'prod', 'stage'] ==> true
        //   mongo tags: ['dev', 'prod'] , userTags: ['stage'] ==> false
        const foundSubscriptions = await models.Subscription.aggregate([
          { $match: { 'org_id': org_id} },
          { $project: { name: 1, uuid: 1, tags: 1, version: 1, channel: 1, channel_name: 1, isSubSet: { $setIsSubset: ['$tags', userTags] } } },
          { $match: { 'isSubSet': true } }
        ]);
              
        if(foundSubscriptions && foundSubscriptions.length > 0 ) {
          urls = await getSubscriptionUrls(org_id, userTags, foundSubscriptions);
        }
      } catch (error) {
        logger.error(error, `There was an error getting ${query} from mongo`);
      }
      return urls;
    },
    subscriptions: async(parent, { org_id }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptions';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      // await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context);
      const conditions = await getUserTagConditions(me, org_id, ACTIONS.READ, 'name', queryName, context);
      logger.debug({req_id, user: whoIs(me), org_id, conditions }, `${queryName} user tag conditions are...`);
      try{
        var subscriptions = await models.Subscription.find({ org_id, ...conditions }, {}, { lean: 1 });
      }catch(err){
        logger.error(err);
        throw err;
      }
      var ownerIds = _.map(subscriptions, 'owner');
      var owners = await models.User.getBasicUsersByIds(ownerIds);

      subscriptions = subscriptions.map((sub)=>{
        if(_.isUndefined(sub.channel_name)){
          sub.channel_name = sub.channel;
        }
        sub.owner = owners[sub.owner];
        return sub;
      });

      return subscriptions;
    },
    subscription: async(parent, { org_id, uuid }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'subscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      // await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context);
      try{
        var subscriptions = await subscriptionResolvers.Query.subscriptions(parent, { org_id }, { models, me, req_id, logger });
        var subscription = subscriptions.find((sub)=>{
          return (sub.uuid == uuid);
        });
        if(!subscription){
          return null;
        }
        if(_.isUndefined(subscription.channel_name)){
          subscription.channel_name = subscription.channel;
        }
        return subscription;
      }catch(err){
        logger.error(err);
        throw err;
      }
    },
  },
  Mutation: {
    addSubscription: async (parent, { org_id, name, tags, channel_uuid, version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.CREATE, TYPES.SUBSCRIPTION, queryName, context);

      try{
        const uuid = UUID();

        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        if(!channel){
          throw new NotFoundError(`channel uuid "${channel_uuid}" not found`);
        }
       
        // validate tags are all exists in label dbs
        await validateTags(org_id, tags, context);

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw  new NotFoundError(`version uuid "${version_uuid}" not found`);
        }
console.log(3333, channel)
        await models.Subscription.create({
          _id: UUID(),
          uuid, org_id, name, tags, owner: me._id,
          channel_name: channel.name, channel_uuid, version: version.name, version_uuid
        });

        pubSub.channelSubChangedFunc({org_id: org_id});

        return {
          uuid,
        };
      }
      catch(err){
        logger.error(err);
        throw err;
      }
    },
    editSubscription: async (parent, { org_id, uuid, name, tags, channel_uuid, version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.SUBSCRIPTION, queryName, context);

      try{
        var subscription = await models.Subscription.findOne({ org_id, uuid });
        if(!subscription){
          throw  new NotFoundError(`subscription { uuid: "${uuid}", org_id:${org_id} } not found`);
        }

        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        if(!channel){
          throw  new NotFoundError(`channel uuid "${channel_uuid}" not found`);
        }

        // validate tags are all exists in label dbs
        await validateTags(org_id, tags, context);
        
        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw  new NotFoundError(`version uuid "${version_uuid}" not found`);
        }

        var sets = {
          name, tags,
          channel_name: channel.name, channel_uuid, version: version.name, version_uuid,
        };
        await models.Subscription.updateOne({ uuid, org_id, }, { $set: sets });

        pubSub.channelSubChangedFunc({org_id: org_id});

        return {
          uuid,
          success: true,
        };
      }
      catch(err){
        logger.error(err);
        throw err;
      }
    },
    setSubscription: async (parent, { org_id, uuid, version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'setSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      // await validAuth(me, org_id, ACTIONS.SETVERSION, TYPES.SUBSCRIPTION, queryName, context);

      try{
        var subscription = await models.Subscription.findOne({ org_id, uuid });
        if(!subscription){
          throw  new NotFoundError(`subscription { uuid: "${uuid}", org_id:${org_id} } not found`);
        }

        // validate user has enough tag permissions to for this sub
        // TODO: we should use specific tag action bellow instead of manage, e.g. setSubscription action
        const userTags = await getUserTags(me, org_id, ACTIONS.SETVERSION, 'name', queryName, context);
        if (subscription.tags.some(t => {return userTags.indexOf(t) === -1;})) {
          // if some tag of the sub does not in user's tag list, throws an error
          throw new ForbiddenError(`you are not allowed to set subscription for all of ${subscription.tags} tags. `);
        }
        
        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: subscription.channel_uuid });
        if(!channel){
          throw new NotFoundError(`channel uuid "${subscription.channel_uuid}" not found`);
        }

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw new NotFoundError(`version uuid "${version_uuid}" not found`);
        }

        var sets = {
          version: version.name, version_uuid,
        };
        await models.Subscription.updateOne({ uuid, org_id }, { $set: sets });

        pubSub.channelSubChangedFunc({org_id: org_id});

        return {
          uuid,
          success: true,
        };
      }
      catch(err){
        logger.error(err);
        throw err;
      }
    },

    removeSubscription: async (parent, { org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.DELETE, TYPES.SUBSCRIPTION, queryName, context);

      var success = false;
      try{
        var subscription = await models.Subscription.findOne({ org_id, uuid });
        if(!subscription){
          throw  new NotFoundError(`subscription uuid "${uuid}" not found`);
        }
        await subscription.deleteOne();

        pubSub.channelSubChangedFunc({org_id: org_id});

        success = true;
      }catch(err){
        logger.error(err);
        throw err;
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
        return { 'has_updates': true };
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
            throw new ForbiddenError('No razee-org-key was supplied');
          }

          const orgId = context.orgId || '';
          if (!orgId) {
            logger.error('No org was found for this org key');
            throw new ForbiddenError('No org was found');
          }

          logger.debug('setting pub sub topic for org id:', orgId);
          const topic = getStreamingTopic(EVENTS.CHANNEL.UPDATED, orgId);
          return GraphqlPubSub.getInstance().pubSub.asyncIterator(topic);
        },
        // eslint-disable-next-line no-unused-vars
        async (parent, args, context) => {
          // 
          // this function determines whether or not to send data back to a subscriber
          //
          const { logger } = context;
          let found = true;

          logger.info('Verify client is authenticated and org_id matches the updated subscription org_id');
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

          if(subscriptionUpdated.data.org_id !== orgId) {
            logger.error('wrong org id for this subscription.  returning false');
            found = false;
          }

          return Boolean(found);
        },
      ),
    },
  },
};

module.exports = subscriptionResolvers;
