/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
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

const { v4: UUID } = require('uuid');
const { ACTIONS, TYPES, SERVICE_SUBSCRIPTION_LIMITS } = require('../models/const');
const {
  whoIs, validAuth, filterSubscriptionsToAllowed,
  NotFoundError, BasicRazeeError, RazeeValidationError, RazeeQueryError
} = require ('./common');
const { GraphqlPubSub } = require('../subscription');
const GraphqlFields = require('graphql-fields');
const { applyQueryFieldsToSubscriptions } = require('../utils/applyQueryFields');
const subscriptionResolvers = require('./subscription');

const pubSub = GraphqlPubSub.getInstance();

const { validateString } = require('../utils/directives');

const serviceResolvers = {

  SubscriptionUnion: {
    __resolveType(obj) {
      if (obj.ssid) {
        return 'ServiceSubscription';
      }
      if (obj.uuid) {
        return 'ChannelSubscription';
      }
      return null;
    }
  },

  Query: {
    subscriptionType: async (parent, { orgId, id }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptionType';
      logger.debug({ req_id, user: whoIs(me), orgId }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.SERVICESUBSCRIPTION, queryName, context);

      let subscription = await models.ServiceSubscription.findOne({ _id: id, org_id: orgId }).lean(); // search only in the user org
      if (subscription) {
        return 'SERVICE';
      }

      subscription = await models.Subscription.findOne({ uuid: id, org_id: orgId }, {}).lean(); // search only in the user org
      if (subscription) {
        return 'USER';
      }

      throw new NotFoundError(context.req.t('Subscription { id: "{{id}}" } not found.', { 'id': id }), context);
    },

    serviceSubscriptions: async(parent, { orgId }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'serviceSubscriptions';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.SERVICESUBSCRIPTION, queryName, context);

      let serviceSubscriptions = [];
      try{
        // User is allowed to see a service subscription only if they have subscription READ permission in the target cluster org
        for await (const ss of models.ServiceSubscription.find({org_id: orgId}).lean({ virtuals: true })) {
          const allowed = await filterSubscriptionsToAllowed(me, ss.clusterOrgId, ACTIONS.READ, TYPES.SERVICESUBSCRIPTION, [ss], context);
          serviceSubscriptions = serviceSubscriptions.concat(allowed);
        }
      }catch(err){
        logger.error(err);
        throw new NotFoundError(context.req.t('Failed to retrieve service subscriptions.'), context);
      }

      serviceSubscriptions.forEach(i => i.ssid = i.uuid);

      await applyQueryFieldsToSubscriptions(serviceSubscriptions, queryFields, { orgId, servSub: true }, context);

      return serviceSubscriptions;
    },

    serviceSubscription: async (parent, { orgId, ssid }, context, fullQuery) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'serviceSubscription';
      logger.debug({ req_id, user: whoIs(me), orgId, ssid }, `${queryName} enter`);

      const allServiceSubscriptions = await serviceResolvers.Query
        .serviceSubscriptions(parent, { orgId }, { models, me, req_id, logger }, fullQuery);

      const serviceSubscription = allServiceSubscriptions.find((sub) => {
        return (sub.ssid == ssid);
      });
      if (!serviceSubscription) { // does not exist or user does not have right to see it
        throw new NotFoundError(context.req.t('Service subscription with ssid "{{ssid}}" not found.', { 'ssid': ssid }), context);
      }
      return serviceSubscription;
    },

    allSubscriptions: async (parent, { orgId }, context, fullQuery) => {
      const subscriptions = await subscriptionResolvers.Query.subscriptions(parent, { orgId }, context, fullQuery);
      const serviceSubscriptions = await serviceResolvers.Query.serviceSubscriptions(parent, { orgId }, context, fullQuery);
      const union = subscriptions.concat(serviceSubscriptions);
      return union;
    }
  },

  Mutation: {
    addServiceSubscription: async (parent, { orgId, name, clusterId, channelUuid, versionUuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addServiceSubscription';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.CREATE, TYPES.SERVICESUBSCRIPTION, queryName, context);

      validateString( 'orgId', orgId );
      validateString( 'name', name );
      validateString( 'clusterId', clusterId );
      validateString( 'channelUuid', channelUuid );
      validateString( 'versionUuid', versionUuid );

      // Note that at this time, service subscriptions can only be created for clusters, not groups

      const cluster = await models.Cluster.findOne({cluster_id: clusterId});
      if(!cluster){
        throw  new NotFoundError(context.req.t('Cluster with cluster_id "{{clusterId}}" not found', {'clusterId':clusterId}), context);
      }

      await validAuth(me, cluster.org_id, ACTIONS.CREATE, TYPES.SERVICESUBSCRIPTION, queryName, context);

      try {
        const total = await models.ServiceSubscription.count({ org_id: orgId });
        if (total >= SERVICE_SUBSCRIPTION_LIMITS.MAX_TOTAL) {
          throw new RazeeValidationError(context.req.t('Too many subscriptions are registered under {{org_id}}.', { 'org_id': orgId }), context);
        }

        const channel = await models.Channel.findOne({ org_id: orgId, uuid: channelUuid }); // search only in the user org
        if (!channel) {
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', { 'channel_uuid': channelUuid }), context);
        }

        // Find the version (avoid using deprecated/ignored `versions` attribute on the channel)
        const version = await models.DeployableVersion.findOne({org_id: orgId, channel_id: channelUuid, uuid: versionUuid});
        if (!version) {
          throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid': versionUuid }), context);
        }

        const kubeOwnerId = await models.User.getKubeOwnerId(context);

        const ssid = UUID();

        await models.ServiceSubscription.create({
          _id: ssid,
          uuid: ssid,
          org_id: orgId,
          name,
          groups: [],
          owner: me._id,
          channelName: channel.name,
          channel_uuid: channel.uuid,
          version: version.name,
          version_uuid: version.uuid,
          clusterId,
          kubeOwnerId,
          clusterOrgId: cluster.org_id
        });

        pubSub.channelSubChangedFunc({org_id: cluster.org_id}, context); // notify cluster should re-fetch its subscriptions

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

    editServiceSubscription: async (parent, { orgId, ssid, name, channelUuid, versionUuid }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'editServiceSubscription';
      logger.debug({ req_id, user: whoIs(me), orgId }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.UPDATE, TYPES.SERVICESUBSCRIPTION, queryName, context);

      validateString( 'orgId', orgId );
      validateString( 'ssid', ssid );
      validateString( 'name', name );
      validateString( 'channelUuid', channelUuid );
      validateString( 'versionUuid', versionUuid );

      const serviceSubscription = await models.ServiceSubscription.findOne({ _id: ssid, org_id: orgId }).lean({ virtuals: true });
      if (!serviceSubscription) {
        throw new NotFoundError(context.req.t('Service subscription with ssid "{{ssid}}" not found.', { 'ssid': ssid }), context);
      }

      await validAuth(me, serviceSubscription.clusterOrgId, ACTIONS.UPDATE, TYPES.SERVICESUBSCRIPTION, queryName, context);

      const channel = await models.Channel.findOne({ org_id: orgId, uuid: channelUuid }); // search only in the user org
      if (!channel) {
        throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', { 'channel_uuid': channelUuid }), context);
      }

      const version = await models.DeployableVersion.findOne({ org_id: orgId, uuid: versionUuid });
      if (!version) {
        throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid': versionUuid }), context);
      }

      const sets = { name, channelName: channel.name, channel_uuid: channelUuid, version: version.name, version_uuid: versionUuid, updated: Date.now() };
      await models.ServiceSubscription.updateOne({ _id: ssid }, { $set: sets });

      pubSub.channelSubChangedFunc({ org_id: serviceSubscription.clusterOrgId }, context); // notify cluster should re-fetch its subscriptions

      return ssid;
    },

    removeServiceSubscription: async (parent, { orgId, ssid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeServiceSubscription';
      logger.debug({req_id, user: whoIs(me), orgId}, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.DELETE, TYPES.SERVICESUBSCRIPTION, queryName, context);

      validateString( 'orgId', orgId );
      validateString( 'ssid', ssid );

      const serviceSubscription = await models.ServiceSubscription.findOne({ _id: ssid, org_id: orgId });
      if (!serviceSubscription) {
        throw new NotFoundError(context.req.t('Service subscription with ssid "{{ssid}}" not found.', { 'ssid': ssid }), context);
      }

      await validAuth(me, serviceSubscription.clusterOrgId, ACTIONS.DELETE, TYPES.SERVICESUBSCRIPTION, queryName, context);

      await serviceSubscription.deleteOne();

      pubSub.channelSubChangedFunc({ org_id:  serviceSubscription.clusterOrgId }, context); // notify cluster should re-fetch its subscriptions

      return ssid;
    }
  }
};

module.exports = serviceResolvers;
