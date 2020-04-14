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
const UUID = require('uuid').v4;
const { pub } = require('../../utils/pubsub');

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');


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

        await models.Subscription.create({
          _id: UUID(),
          uuid, org_id, name, tags, owner: me._id,
          channel: channel.name, channel_uuid, version: version.name, version_uuid
        });

        var msg = {
          orgId: org_id,
          groupName: name,
        };
        pub('addSubscription', msg);

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

        var msg = {
          orgId: org_id,
          groupName: name,
          subscription,
        };
        pub('updateSubscription', msg);

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

        var msg = {
          orgId: org_id,
          groupName: subscription.name,
        };
        pub('removeSubscription', msg);

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
};

module.exports = resourceResolvers;
