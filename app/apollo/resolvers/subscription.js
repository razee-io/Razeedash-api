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
const uuid = require('uuid');

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');


const resourceResolvers = {
    Query: {
        subscriptions: async(parent, { org_id }, { models, me, req_id, logger }) => {
            const queryName = 'subscriptions';
            logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
            await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, models, queryName, req_id, logger);
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
        subscription: async(parent, { org_id, _id }, { models, me, req_id, logger }) => {
            const queryName = 'subscription';
            logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
            await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, models, queryName, req_id, logger);

            try{
                var subscriptions = await resourceResolvers.Query.subscriptions(parent, { org_id }, { models, me, req_id, logger });
                var subscription = subscriptions.find((sub)=>{
                    return (sub._id == _id);
                });
                return subscription;
            }catch(err){
                logger.error(err);
                throw err;
            }
        },
    },
    Mutation: {
        addSubscription: async (parent, { org_id, name, tags, channel_uuid, version_uuid }, { models, me, req_id, logger })=>{
            const queryName = 'addSubscription';
            logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
            await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.SUBSCRIPTION, models, queryName, req_id, logger);

            try{
                const _id = uuid();

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
                    _id, org_id, name, tags, uuid: uuid(), owner: me._id,
                    channel: channel.name, channel_uuid, version: version.name, version_uuid
                });
                return {
                    _id,
                };
            }
            catch(err){
                logger.error(err);
                throw err;
            }
        },
        editSubscription: async (parent, { org_id, _id, name, tags, channel_uuid, version_uuid }, { models, me, req_id, logger })=>{
            const queryName = 'editSubscription';
            logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
            await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.SUBSCRIPTION, models, queryName, req_id, logger);

            try{
                var subscription = await models.Subscription.findOne({ org_id, _id });
                if(!subscription){
                    throw `subscription { _id: "${_id}", org_id:${org_id} } not found`;
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
                await models.Subscription.updateOne({ _id, org_id, }, { $set: sets });

                return {
                    _id,
                    success: true,
                };
            }
            catch(err){
                logger.error(err);
                throw err;
            }
        },
        removeSubscription: async (parent, { org_id, _id }, { models, me, req_id, logger })=>{
            const queryName = 'removeSubscription';
            logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
            await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.SUBSCRIPTION, models, queryName, req_id, logger);

            var success = false;
            try{
                var subscription = await models.Subscription.findOne({ org_id, _id });
                if(!subscription){
                    throw `subscription id "${_id}" not found`;
                }
                await subscription.deleteOne();
                success = true;
            }catch(err){
                logger.error(err);
                throw err;
            }
            return {
                _id, success,
            };
        },
    }
};

module.exports = resourceResolvers;
