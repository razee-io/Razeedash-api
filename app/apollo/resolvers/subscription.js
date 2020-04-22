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
// const { pub } = require('../../utils/pubsub');
const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');
const getSubscriptionUrls = require('../../utils/subscriptions.js').getSubscriptionUrls;
const { EVENTS, pubSubPlaceHolder, getStreamingTopic, channelSubChangedFunc } = require('../subscription');
const { models } = require('../models');


const resourceResolvers = {
  Query: {
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
        var subscriptions = await resourceResolvers.Query.subscriptions(parent, { org_id }, { models, me, req_id, logger });
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

        const subscription = await models.Subscription.create({
          _id: UUID(),
          uuid, org_id, name, tags, owner: me._id,
          channel: channel.name, channel_uuid, version: version.name, version_uuid
        });

        // var msg = {
        //   uuid: uuid,
        //   org_id: org_id,
        //   name: name,
        //   tags: tags,
        //   channel_uuid: channel_uuid,
        //   channel: channel.name,
        //   version: version.name,
        //   version_uuid: version_uuid,
        //   owner: me._id
        // };
        // pub('addSubscription', msg);
        // channelSubChangedFunc(msg);
        channelSubChangedFunc(subscription);

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
        const updatedSubscription = await models.Subscription.findOne({ org_id, uuid });

        // var msg = {
        //   org_id: org_id,
        //   uuid: uuid,
        //   name: name,
        //   tags: tags,
        //   subscription,
        // };
        // pub('updateSubscription', msg);
        // channelSubChangedFunc(msg);
        channelSubChangedFunc(updatedSubscription);


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

        // var msg = {
        //   orgId: org_id,
        //   subName: subscription.name,
        // };
        channelSubChangedFunc(subscription);
        // pub('removeSubscription', msg);

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
      resolve: async (parent, args) => {
        console.log('****************** Send data back to the subscriber client');
        const { subscriptionUpdated } = parent;

        try {
          let curSubs = await models.Subscription.aggregate([
            { $match: { 'org_id': subscriptionUpdated.sub.org_id} },
            { $project: { name: 1, uuid: 1, tags: 1, version: 1, channel: 1, isSubSet: { $setIsSubset: ['$tags', subscriptionUpdated.sub.tags ] } } },
            { $match: { 'isSubSet': true } }
          ]);
          curSubs = _.sortBy(curSubs, '_id');
          console.log('curSubs');
          console.log(curSubs);
          console.log("match curSubs with set of tags from the user:")
          console.log(args.tags);

          const urls = await getSubscriptionUrls(subscriptionUpdated.sub.org_id, args.tags, curSubs);
          // exposes the name and uuid fields to the user
          // const publicSubs = _.map(curSubs, (sub)=>{
          //   return _.pick(sub, ['name', 'uuid']);
          // });
          // console.log({publicSubs, urls});
          // console.log(urls);
          subscriptionUpdated.sub.urls = urls;
          
        } catch (error) {
          console.log(error);
        }
        console.log('updated subscription: ', subscriptionUpdated.sub);
        
        return subscriptionUpdated.sub;
      },

      subscribe: withFilter(
        // eslint-disable-next-line no-unused-vars
        (parent, args, context) => {
          // args comes from clients that are initiating a subscription
          console.log('A client is connected with args:', args);
          const topic = getStreamingTopic(EVENTS.CHANNEL.UPDATED, args.org_id);
          return pubSubPlaceHolder.pubSub.asyncIterator(topic);
        },
        async (parent, args, context) => {
          // this function determines whether or not to send data back to a subscriber
          console.log('Verify client is authenticated and org_id matches the updated subscription org_id');
          const { subscriptionUpdated } = parent;
          const queryName = 'channel subscribe: withFilter';
          const { me, req_id, logger } = context;
          // validate user
          // await validAuth(me, args.org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);  
          let found = true;
          console.log('----------------------------------------- ' + subscriptionUpdated.sub.org_id + ' vs ' + args.org_id);
          if(subscriptionUpdated.sub.org_id !== args.org_id) {
            found = false;
          }

          try {
            let curSubs = await models.Subscription.aggregate([
              { $match: { 'org_id': subscriptionUpdated.sub.org_id} },
              { $project: { name: 1, uuid: 1, tags: 1, version: 1, channel: 1, isSubSet: { $setIsSubset: ['$tags', subscriptionUpdated.sub.tags ] } } },
              { $match: { 'isSubSet': true } }
            ]);
            curSubs = _.sortBy(curSubs, '_id');
            console.log('curSubs');
            console.log(curSubs);
            console.log("match curSubs with set of tags from the user:")
            console.log(args.tags);
            const urls = await getSubscriptionUrls(subscriptionUpdated.sub.org_id, args.tags, curSubs);
            console.log(urls);
            
            if(urls && urls.length > 0 ) {
              found = true;
            } else {
              found = false;
            }
            
          } catch (error) {
            console.log(error);
          }

          return Boolean(found);
        },
      ),
    },
  },
};

module.exports = resourceResolvers;
