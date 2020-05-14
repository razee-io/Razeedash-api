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
const { ForbiddenError } = require('apollo-server');
const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');
const getSubscriptionUrls = require('../../utils/subscriptions.js').getSubscriptionUrls;
const tagsStrToArr = require('../../utils/subscriptions.js').tagsStrToArr;
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');

const pubSub = GraphqlPubSub.getInstance();

const subscriptionResolvers = {
  Query: {
    subscriptionsByTag: async(parent, { tags }, context) => {
      const { models, logger } = context;
      const query = 'subscriptionsByTag';

      const orgKey = context.req.headers['razee-org-key'] || '';
      if (!orgKey) {
        logger.error('No razee-org-key was supplied');
        throw new ForbiddenError('No razee-org-key was supplied');
      }

      const org = await models.Organization.findOne({ orgKeys: orgKey });
      if(!org) {
        logger.error('An org was not found for this razee-org-key');
        throw new ForbiddenError('org id was not found');
      }
      const org_id = org._id;
      const userTags = tagsStrToArr(tags);

      logger.debug({user: 'graphql api user', org_id, tags }, `${query} enter`);
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
          { $project: { name: 1, uuid: 1, tags: 1, version: 1, channel: 1, isSubSet: { $setIsSubset: ['$tags', userTags] } } },
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
      await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context);

      try{
        var subscriptions = await models.Subscription.find({ org_id }, {}, { lean: 1 });
      }catch(err){
        logger.error(err);
        throw err;
      }
      var ownerIds = _.map(subscriptions, 'owner');
      var owners = await models.User.getBasicUsersByIds(ownerIds);

      subscriptions = subscriptions.map((sub)=>{
        sub.owner = owners[sub.owner];
        return sub;
      });

      return subscriptions;
    },
    subscription: async(parent, { org_id, uuid }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'subscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context);

      try{
        var subscriptions = await subscriptionResolvers.Query.subscriptions(parent, { org_id }, { models, me, req_id, logger });
        var subscription = subscriptions.find((sub)=>{
          return (sub.uuid == uuid);
        });
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
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.SUBSCRIPTION, queryName, context);

      try{
        const uuid = UUID();

        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        if(!channel){
          throw `channel uuid "${channel_uuid}" not found`;
        }

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw `version uuid "${version_uuid}" not found`;
        }

        await models.Subscription.create({
          _id: UUID(),
          uuid, org_id, name, tags, owner: me.user._id,
          channel: channel.name, channel_uuid, version: version.name, version_uuid
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
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.SUBSCRIPTION, queryName, context);

      try{
        var subscription = await models.Subscription.findOne({ org_id, uuid });
        if(!subscription){
          throw `subscription { uuid: "${uuid}", org_id:${org_id} } not found`;
        }

        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        if(!channel){
          throw `channel uuid "${channel_uuid}" not found`;
        }

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw `version uuid "${version_uuid}" not found`;
        }

        var sets = {
          name, tags,
          channel: channel.name, channel_uuid, version: version.name, version_uuid,
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
    removeSubscription: async (parent, { org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.SUBSCRIPTION, queryName, context);

      var success = false;
      try{
        var subscription = await models.Subscription.findOne({ org_id, uuid });
        if(!subscription){
          throw `subscription uuid "${uuid}" not found`;
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
