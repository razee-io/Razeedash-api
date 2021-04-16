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
const { ACTIONS, TYPES, SERVICE_SUBSCRIPTION_LIMITS } = require('../models/const');
const {
  whoIs, validAuth, validClusterAuth,
  getGroupConditions, getAllowedGroups, filterSubscriptionsToAllowed,
  getGroupConditionsIncludingEmpty,
  NotFoundError, BasicRazeeError, RazeeValidationError, RazeeQueryError, RazeeForbiddenError
} = require ('./common');
const getSubscriptionUrls = require('../../utils/subscriptions.js').getSubscriptionUrls;
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');
const GraphqlFields = require('graphql-fields');
const { applyQueryFieldsToSubscriptions } = require('../utils/applyQueryFields');

const pubSub = GraphqlPubSub.getInstance();

const serviceResolvers = {

  Query: {

    subscriptionType: async(parent, { id }, context) => {
      const { models, logger } = context;
      try{
        var subscription = await models.ServiceSubscription.find({ uuid: id }).lean();
        if (subscription.length >0) {
          return "SERVICE";
        } else {
          subscription = await models.Subscription.findOne({ uuid: id }, {}).lean();
          if (subscription) {
            return "USER";
          }
        }
      }catch(err){
        logger.error(err);
        throw new NotFoundError(context.req.t('Failed to retrieve service subscriptions.'), context);
      }
      throw  new NotFoundError(context.req.t('Subscription { uuid: "{{uuid}}" } not found.', {'uuid':id}), context);
    },

    serviceSubscriptions: async(parent, { orgId: org_id }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'serviceSubscriptions';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      try{
        var serviceSubscriptions = await models.ServiceSubscription.find({org_id}).lean({ virtuals: true });
      }catch(err){
        logger.error(err);
        throw new NotFoundError(context.req.t('Failed to retrieve service subscriptions.'), context);
      }

      serviceSubscriptions.forEach(i => i.ssid = i.uuid);

      // render owner information if users ask for
      if(queryFields.owner && serviceSubscriptions) {
        const ownerIds = _.map(serviceSubscriptions, 'owner');
        const owners = await models.User.getBasicUsersByIds(ownerIds);

        serviceSubscriptions = serviceSubscriptions.map((sub)=>{
          if(_.isUndefined(sub.channelName)){
            sub.channelName = sub.channel;
          }
          sub.owner = owners[sub.owner];
          return sub;
        });
      }

      await applyQueryFieldsToSubscriptions(serviceSubscriptions, queryFields, { orgId: org_id }, context);

    return serviceSubscriptions;
    },

  },

  Mutation: {
    addServiceSubscription: async (parent, { orgId, name, clusterId, channelUuid, versionUuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addServiceSubscription';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);
      await validAuth(me, orgId, ACTIONS.CREATE, TYPES.SUBSCRIPTION, queryName, context);

      try{
        // validate the number of total subscriptions are under the limit
        const total = await models.ServiceSubscription.count({orgId});
        if (total >= SERVICE_SUBSCRIPTION_LIMITS.MAX_TOTAL ) {
          throw new RazeeValidationError(context.req.t('Too many service subscriptions are registered for {{orgId}}.', {'orgId':orgId}), context);
        } 

        // loads the channel
        var channel = await models.Channel.findOne({ org_id: orgId, uuid: channelUuid });
        if(!channel){
          throw new NotFoundError(context.req.t('channel uuid "{{channelUuid}}" not found', {'channelUuid':channelUuid}), context);
        }

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == versionUuid);
        });
        if(!version){
          throw  new NotFoundError(context.req.t('version uuid "{{versionUuid}}" not found', {'versionUuid':versionUuid}), context);
        }

        // TODO: check if clusterId belongs to the caller's orgId

        const kubeOwnerName = await models.User.getKubeOwnerName(context);

        const ssid = UUID();

        await models.ServiceSubscription.create({
          _id: ssid,
          uuid: ssid, org_id: orgId, name, groups: [], owner: me._id,
          channelName: channel.name, channel_uuid: channelUuid, version: version.name, version_uuid: versionUuid,
          clusterId,
          kubeOwnerName,
        });

        pubSub.channelSubChangedFunc({orgId: orgId}, context);

        return ssid;
      }
      catch (err) {
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', { 'queryName': queryName, 'req_id': req_id }), context);
      }
    },

    removeServiceSubscription: async (parent, { ssid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeServiceSubscription';
      logger.debug({req_id, user: whoIs(me)}, `${queryName} enter`);

      try {

        const serviceSubscription = await models.ServiceSubscription.findById(ssid);
        if (!serviceSubscription) {
          throw new NotFoundError(context.req.t('Service Subscription ssid "{{ssid}}" not found.', { 'ssid': ssid }), context);
        }

        const org_id = serviceSubscription.org_id;

        await serviceSubscription.deleteOne();

        pubSub.channelSubChangedFunc({ org_id }, context);

      } catch (err) {
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', { 'queryName': queryName, 'req_id': req_id }), context);
      }
      return ssid;
    }
  }
};

module.exports = serviceResolvers;
