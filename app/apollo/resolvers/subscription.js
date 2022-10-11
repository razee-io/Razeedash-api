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

const _ = require('lodash');
const { v4: UUID } = require('uuid');

const { withFilter } = require('graphql-subscriptions');

const { ACTIONS, TYPES, CHANNEL_CONSTANTS } = require('../models/const');
const {
  whoIs, validAuth, validClusterAuth,
  getGroupConditions, getAllowedGroups, filterSubscriptionsToAllowed,
  getGroupConditionsIncludingEmpty,
  NotFoundError, BasicRazeeError, RazeeValidationError, RazeeQueryError, RazeeForbiddenError
} = require ('./common');
const getSubscriptionDetails = require('../../utils/subscriptions.js').getSubscriptionDetails;
const getServiceSubscriptionDetails = require('../../utils/serviceSubscriptions.js').getServiceSubscriptionDetails;
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');
const GraphqlFields = require('graphql-fields');
const { applyQueryFieldsToSubscriptions } = require('../utils/applyQueryFields');

// RBAC Sync
const { subscriptionsRbacSync } = require('../utils/rbacSync');

const pubSub = GraphqlPubSub.getInstance();

const { validateString } = require('../utils/directives');

const { validateGroups, validateSubscriptionLimit } = require('../utils/subscriptionUtils.js');
const { validateNewVersions, ingestVersionContent } = require('../utils/versionUtils');
const storageFactory = require('./../../storage/storageFactory');

const subscriptionResolvers = {
  Query: {
    subscriptionsByClusterId: async(parent, { clusterId: cluster_id, /* may add some unique data from the cluster later for verification. */ }, context) => {
      const { req_id, me, models, logger } = context;
      const queryName = 'subscriptionsByClusterId';
      logger.debug({req_id, user: whoIs(me), cluster_id,}, `${queryName} enter`);
      await validClusterAuth(me, queryName, context);

      const org = await models.User.getOrg(models, me);
      if(!org) {
        logger.error('An org was not found for this razee-org-key');
        throw new RazeeValidationError(context.req.t('org id was not found'), context);
      }
      const org_id = org._id;

      const cluster = await models.Cluster.findOne({org_id, cluster_id}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeValidationError(context.req.t('Could not locate the cluster with cluster_id {{cluster_id}}', {'cluster_id':cluster_id}), context);
      }
      const clusterGroupNames = (cluster.groups) ? cluster.groups.map(l => l.name) : [];

      logger.debug({user: 'graphql api user', org_id, clusterGroupNames }, `${queryName} enter`);
      const subs = [];
      try {
        // Add in OrgKey rollout System Subscription first, so it is most likely to be rolled out
        subs.push({
          subscriptionUuid: 'system-primaryorgkey',
          subscriptionName: 'system-primaryorgkey',  //Unused, but needs to be included for graphql response
          subscriptionChannel: 'system-primaryorgkey',  //Unused, but needs to be included for graphql response
          subscriptionVersion: 'system-primaryorgkey',  //Unused, but needs to be included for graphql response
          url: 'api/v1/systemSubscriptions/primaryOrgKey',
          kubeOwnerName: null,
        });

        // Add in any normal Subscriptions for the cluster's groups or cluster id
        // examples:
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod', 'stage'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['stage'] ==> false
        const foundSubscriptions = await models.Subscription.find({
          'org_id': org_id,
          $or: [
            { groups: { $in: clusterGroupNames } },
            { clusterId: cluster_id },
          ],
        }).lean(/* skip virtuals: true for now since it is class facing api. */);
        logger.info({org_id, req_id, user: whoIs(me), cluster_id, clusterGroupNames}, `${queryName} found ${foundSubscriptions?foundSubscriptions.length:'ERR'} subscriptions for ${clusterGroupNames.length} groups`);
        _.each(foundSubscriptions, (sub)=>{
          if(_.isUndefined(sub.channelName)){
            sub.channelName = sub.channel;
          }
        });
        if( foundSubscriptions && foundSubscriptions.length > 0 ) {
          const subscriptionDetails = await getSubscriptionDetails(org_id, foundSubscriptions, cluster);
          subs.push( ...subscriptionDetails );
        }

        // Add in any service subscriptions
        const serviceSubDetails = await getServiceSubscriptionDetails(cluster);
        subs.push( ...serviceSubDetails );
      }
      catch( error ) {
        logger.error(error, `There was an error resolving ${queryName}`);
        logger.info({org_id, req_id, user: whoIs(me), cluster_id}, `${queryName} There was an error resolving subscriptions: ${error.message}`);
        // Continue and return as many as possible -- e.g. SystemSubscriptions like primaryOrgKey should be returned so they can be applied even if there was an error retrieving 'normal' subscriptions.
      }
      logger.info({org_id, req_id, user: whoIs(me), cluster_id, subs, clusterGroupNames}, `${queryName} returning ${subs.length} subscriptions for cluster ${cluster_id}`);
      return subs;
    },

    subscriptions: async(parent, { orgId: org_id }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptions';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      // await validAuth(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context);
      const conditions = await getGroupConditions(me, org_id, ACTIONS.READ, 'name', queryName, context);
      logger.debug({req_id, user: whoIs(me), org_id, conditions }, `${queryName} group conditions are...`);
      let subs = [];
      try{
        subs = await models.Subscription.find({ org_id, ...conditions }, {}).lean({ virtuals: true });
        logger.info({req_id, user: whoIs(me), org_id, subs}, `${queryName} found ${subs?subs.length:'ERR'} subscriptions`);
        subs = await filterSubscriptionsToAllowed(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, subs, context);
        logger.info({req_id, user: whoIs(me), org_id, subs}, `${queryName} filtered to ${subs?subs.length:'ERR'} subscriptions`);
      }catch(err){
        logger.error(err);
        throw new NotFoundError(context.req.t('Could not find the subscription.'), context);
      }

      await applyQueryFieldsToSubscriptions(subs, queryFields, { orgId: org_id }, context);

      return subs;
    },

    subscription: async(parent, { orgId, uuid, name, _queryName }, context, fullQuery) => {
      const { me, req_id, logger } = context;
      const queryName = _queryName ? `${_queryName}/subscription` : 'subscription';
      logger.debug({req_id, user: whoIs(me), org_id: orgId, uuid, name }, `${queryName} enter`);

      const subs = await subscriptionResolvers.Query.subscriptions(parent, { orgId }, context, fullQuery);

      const matchingSubs = subs.filter( s => {
        return (s.uuid === uuid || s.name === name);
      } );

      // If more than one matching subscription found, throw an error
      if( matchingSubs.length > 1 ) {
        logger.info({req_id, user: whoIs(me), org_id: orgId, uuid, name }, `${queryName} found ${matchingSubs.length} matching subscriptions` );
        throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'subscription', 'name':name}), context);
      }

      return matchingSubs[0] || null;
    },

    subscriptionByName: async(parent, { orgId, name }, context, fullQuery) => {
      const { me, req_id, logger } = context;
      const queryName = 'subscriptionByName';
      logger.debug({req_id, user: whoIs(me), org_id: orgId , name }, `${queryName} enter`);
      return await subscriptionResolvers.Query.subscription(parent, { orgId, name, _queryName: queryName }, context, fullQuery);
    },

    subscriptionsForCluster: async(parent, {  orgId: org_id , clusterId: cluster_id  }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptionsForCluster';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      //find groups in cluster
      const cluster = await models.Cluster.findOne({org_id, cluster_id}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeValidationError(context.req.t('Could not locate the cluster with cluster_id {{cluster_id}}', {'cluster_id':cluster_id}), context);
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
            throw new RazeeForbiddenError(context.req.t('You are not allowed to read subscriptions due to missing permissions on cluster group {{group.name}}.', {'group.name':group.name}), context);
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
        var subscriptions = await models.Subscription.find({
          org_id,
          $or: [
            { groups: { $in: clusterGroupNames } },
            { clusterId: cluster_id },
          ],
        }).lean({ virtuals: true });
        subscriptions = await filterSubscriptionsToAllowed(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, subscriptions, context);
      }catch(err){
        logger.error(err);
        throw new NotFoundError(context.req.t('Could not find subscriptions.'), context);
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
        throw new RazeeValidationError(context.req.t('Could not locate the cluster with clusterName {{clusterName}}', {'clusterName':clusterName}), context);
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
            throw new RazeeForbiddenError(context.req.t('You are not allowed to read subscriptions due to missing permissions on cluster group {{group.name}}.', {'group.name':group.name}), context);
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
        var subscriptions = await models.Subscription.find({
          org_id,
          $or: [
            { groups: { $in: clusterGroupNames } },
            { clusterId: cluster.cluster_id },
          ]
        }).lean({ virtuals: true });
        subscriptions = await filterSubscriptionsToAllowed(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, subscriptions, context);
      }catch(err){
        logger.error(err);
        throw new NotFoundError(context.req.t('Could not find subscriptions.'), context);
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
    addSubscription: async (parent, { orgId: org_id, name, groups=[], channelUuid: channel_uuid, versionUuid: version_uuid, version: newVersion, clusterId=null, custom: custom }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.CREATE, TYPES.SUBSCRIPTION, queryName, context);

      validateString( 'org_id', org_id );
      validateString( 'name', name );
      groups.forEach( value => { validateString( 'groups', value ); } );
      validateString( 'channel_uuid', channel_uuid );
      if( version_uuid ) validateString( 'version_uuid', version_uuid );
      if( clusterId ) validateString( 'clusterId', clusterId );

      try{
        const kubeOwnerId = await models.User.getKubeOwnerId(context);

        // Experimental
        if( !process.env.EXPERIMENTAL_GITOPS ) {
          // Block experimental features
          if( newVersion ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'version' } ), context );
          }
        }

        // validate the number of total subscriptions are under the limit
        await validateSubscriptionLimit( org_id, 1, context );

        // loads the channel
        const channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':channel_uuid}), context);
        }

        // get org
        const org = await models.Organization.findOne({ _id: org_id });
        if (!org) {
          throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':org_id}), context);
        }

        // validate groups all exist
        await validateGroups(org_id, groups, context);

        // Get or create the version
        let version;
        // Load the existing version if version_uuid specified
        if( version_uuid ) {
          version = channel.versions.find((version)=>{
            return (version.uuid == version_uuid);
          });
          if(!version){
            throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':version_uuid}), context);
          }
        }
        // Validate newVersion if specified
        else if( newVersion ) {
          // create newVersionObj
          const newVersionObj = {
            _id: UUID(),
            org_id: org_id,
            uuid: UUID(),
            channel_id: channel.uuid,
            channelName: channel.name,
            name: newVersion.name,
            description: newVersion.description,
            type: newVersion.type,
            ownerId: me._id,
            kubeOwnerId,
          };
          if( newVersion.remote ) newVersionObj.remote = newVersion.remote;
          if( newVersion.content ) newVersionObj.content = newVersion.content;
          if( newVersion.file ) newVersionObj.file = newVersion.file;

          // Validate new version
          await validateNewVersions( org_id, { channel: channel, newVersions: [newVersion] }, context );

          // Load/save the version content
          await ingestVersionContent( org_id, { org, channel, version: newVersionObj, file: newVersion.file, content: newVersion.content, remote: newVersion.remote }, context );
          // Note: if failure occurs after this point, the data may already have been stored by storageFactory even if the Version document doesnt get saved

          // Save Version
          const dObj = await models.DeployableVersion.create( newVersionObj );
          version = dObj;

          // Attempt to update Version references the channel (the duplication is unfortunate and should be eliminated in the future)
          try {
            const channelVersionObj = {
              uuid: newVersionObj.uuid,
              name: newVersionObj.name,
              description: newVersionObj.description,
              created: dObj.created
            };
            await models.Channel.updateOne(
              { org_id, uuid: channel.uuid },
              { $push: { versions: channelVersionObj } }
            );
          } catch(err) {
            logger.error(err, `${queryName} failed to update the channel to reference the new Version '${newVersionObj.name}' / '${newVersionObj.uuid}' when serving ${req_id}.`);
            // Cannot fail here, the Version has already been created.  Continue.
          }
        }
        // If neither version_uuid nor newVersion specified, fail validation
        else {
          throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':version_uuid}), context);
        }

        const uuid = UUID();
        const subscription = {
          _id: UUID(),
          uuid, org_id, name, groups, owner: me._id,
          channelName: channel.name, channel_uuid, version: version.name, version_uuid: version.uuid,
          clusterId,
          kubeOwnerId,
          custom
        };
        await models.Subscription.create( subscription );

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        /*
        Trigger RBAC Sync after successful Subscription creation and pubSub.
        RBAC Sync completes asynchronously, so no `await`.
        Even if RBAC Sync errors, subscription creation is successful.
        */
        subscriptionsRbacSync( [subscription], { resync: false }, context ).catch(function(){/*ignore*/});

        return {
          uuid,
        };
      }
      catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    editSubscription: async (parent, { orgId, uuid, name, groups=[], channelUuid: channel_uuid, versionUuid: version_uuid, version: newVersion, clusterId=null, updateClusterIdentity, custom: custom }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editSubscription';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);

      validateString( 'orgId', orgId );
      validateString( 'uuid', uuid );
      validateString( 'name', name );
      groups.forEach( value => { validateString( 'groups', value ); } );
      validateString( 'channel_uuid', channel_uuid );
      if( version_uuid ) validateString( 'version_uuid', version_uuid );
      if( clusterId ) validateString( 'clusterId', clusterId );

      try{
        const kubeOwnerId = await models.User.getKubeOwnerId(context);

        // Experimental
        if( !process.env.EXPERIMENTAL_GITOPS ) {
          // Block experimental features
          if( newVersion ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'version' } ), context );
          }
        }

        const conditions = await getGroupConditionsIncludingEmpty(me, orgId, ACTIONS.READ, 'name', queryName, context);
        logger.debug({req_id, user: whoIs(me), orgId, conditions }, `${queryName} group conditions are...`);

        const subscription = await models.Subscription.findOne({ org_id: orgId, uuid, ...conditions }, {}).lean({ virtuals: true });
        if(!subscription){
          throw new NotFoundError(context.req.t('Subscription { uuid: "{{uuid}}", org_id:{{org_id}} } not found.', {'uuid':uuid, 'org_id':orgId}), context);
        }

        const oldVersionUuid = subscription.version_uuid;
        // If neither version_uuid or version specified, keep the prior version (i.e. set version_uuid)
        if( !version && !version_uuid ) version_uuid = oldVersionUuid;

        await validAuth(me, orgId, ACTIONS.UPDATE, TYPES.SUBSCRIPTION, queryName, context, [subscription.uuid, subscription.name]);

        // get org
        const org = await models.Organization.findOne({ _id: orgId });
        if (!org) {
          throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':orgId}), context);
        }

        // get channel
        const channel = await models.Channel.findOne({ org_id: orgId, uuid: channel_uuid });
        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':channel_uuid}), context);
        }

        // validate groups all exist
        await validateGroups(orgId, groups, context);

        // Get or create the version
        let version;
        // Load the existing version if version_uuid specified
        if( version_uuid ) {
          version = channel.versions.find((version)=>{
            return (version.uuid == version_uuid);
          });
          if(!version){
            throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':version_uuid}), context);
          }
        }
        // Validate newVersion if specified
        else if( newVersion ) {
          // create newVersionObj
          const newVersionObj = {
            _id: UUID(),
            org_id: orgId,
            uuid: UUID(),
            channel_id: channel.uuid,
            channelName: channel.name,
            name: newVersion.name,
            description: newVersion.description,
            type: newVersion.type,
            ownerId: me._id,
            kubeOwnerId,
          };
          if( newVersion.remote ) newVersionObj.remote = newVersion.remote;
          if( newVersion.content ) newVersionObj.content = newVersion.content;
          if( newVersion.file ) newVersionObj.file = newVersion.file;

          // Validate new version
          await validateNewVersions( orgId, { channel: channel, newVersions: [newVersion] }, context );

          // Load/save the version content
          await ingestVersionContent( orgId, { org, channel, version: newVersionObj, file: newVersion.file, content: newVersion.content, remote: newVersion.remote }, context );
          // Note: if failure occurs after this point, the data may already have been stored by storageFactory even if the Version document doesnt get saved

          // Save Version
          const dObj = await models.DeployableVersion.create( newVersionObj );
          version = dObj;
        }
        // If neither version_uuid nor newVersion specified, fail validation
        else {
          throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':version_uuid}), context);
        }

        let sets = {
          name,
          groups,
          channelName: channel.name,
          channel_uuid,
          version: version.name,
          version_uuid: version.uuid,
          clusterId,
          custom,
          updated: Date.now(),
        };

        // RBAC Sync
        if( updateClusterIdentity ) {
          sets['owner'] = me._id;
          sets['kubeOwnerId'] = kubeOwnerId;
        }

        await models.Subscription.updateOne({ uuid, org_id: orgId, }, { $set: sets });

        pubSub.channelSubChangedFunc({ org_id: orgId }, context);

        /*
        RBAC Sync
        Trigger after successful Subscription update and pubSub.
        RBAC Sync completes asynchronously, so no `await`.
        Even if RBAC Sync errors, subscription edit is successful.
        */
        let syncNeeded = false;
        let resyncNeeded = false;
        if( updateClusterIdentity ) {
          // If resyncing, trigger RBAC Sync of all clusters
          syncNeeded = true;
          resyncNeeded = true;
        }
        else if( me._id != subscription.owner ) {
          // If changing owner, trigger RBAC Sync of any un-synced clusters
          syncNeeded = true;
          resyncNeeded = false;
        } else {
          // If adding any new group(s), trigger RBAC Sync of any un-synced clusters
          for( const group of groups ) {
            if( !subscription.groups.includes(group) ) {
              // At least one new group, trigger sync and stop checking for new groups
              syncNeeded = true;
              resyncNeeded = false;
              break;
            }
          }
        }
        // If sync needed, do it
        if( syncNeeded ) {
          // Set the new owner and groups on the subscription object before using it to do RBAC Sync
          subscription.groups = groups;
          subscription.owner = me._id;
          subscriptionsRbacSync( [subscription], { resync: resyncNeeded }, context ).catch(function(){/*ignore*/});
        }

        // If newVersion is specified try to remove the old version
        if( newVersion ) {
          try {
            const subCount = await models.Subscription.count({ org_id: orgId, version_uuid: oldVersionUuid });
            if( subCount > 0 ) {
              logger.info( { org_id: orgId, req_id, user: whoIs(me), subscription: subscription.uuid, ver_uuid: oldVersionUuid }, `${queryName} old version ${oldVersionUuid} is still in use by ${subCount} subscriptions, skipping deletion` );
            }
            else {
              logger.info( { org_id: orgId, req_id, user: whoIs(me), subscription: subscription.uuid, ver_uuid: oldVersionUuid }, `${queryName} old version ${oldVersionUuid} is replaced by ${version.uuid}, attempting deletion` );

              // Get the old Version
              const deployableVersionObj = await models.DeployableVersion.findOne( { org_id: orgId, uuid: oldVersionUuid } );

              // If the Version is found...
              if( deployableVersionObj ){
                if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
                  // Delete Version data
                  const handler = storageFactory(logger).deserialize( deployableVersionObj.content );
                  await handler.deleteData();
                  logger.info( { org_id: orgId, req_id, user: whoIs(me), subscription: subscription.uuid, ver_uuid: deployableVersionObj.uuid, ver_name: deployableVersionObj.name }, `${queryName} old version ${oldVersionUuid} data removed`);
                }

                // Delete the Version
                await models.DeployableVersion.deleteOne( { org_id: orgId, uuid: oldVersionUuid } );
                logger.info( { org_id: orgId, req_id, user: whoIs(me), subscription: subscription.uuid, ver_uuid: oldVersionUuid }, `${queryName} old version ${oldVersionUuid} deleted` );
              }
            }

            // Attempt to update Version references in the channel (the duplication is unfortunate and should be eliminated in the future)
            await models.Channel.updateOne(
              { org_id: orgId, uuid: channel.uuid },
              { $pull: { versions: { uuid: uuid } } }
            );
            logger.info( { org_id: orgId, req_id, user: whoIs(me), subscription: subscription.uuid, ver_uuid: oldVersionUuid }, `${queryName} channel reference to old version ${oldVersionUuid} removed` );
          }
          catch(err) {
            logger.error(err, `${queryName} failed to update the channel to remove the version reference '${name}' / '${uuid}' when serving ${req_id}.`);
            // Cannot fail here, the Version has already been removed.  Continue.
          }
        }

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
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    setSubscription: async (parent, { orgId: org_id, uuid, versionUuid: version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'setSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );
      validateString( 'version_uuid', version_uuid );

      /*
      RBAC Sync:
      setSubscription only changes the Version used by a Subscription, so does
      not need to trigger RBAC Sync (no owner change, no groups change).
      */

      // await validAuth(me, org_id, ACTIONS.SETVERSION, TYPES.SUBSCRIPTION, queryName, context);

      try{
        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'name', queryName, context);
        logger.debug({req_id, user: whoIs(me), org_id, conditions }, `${queryName} group conditions are...`);
        var subscription = await models.Subscription.findOne({ org_id, uuid, ...conditions }, {}).lean({ virtuals: true });

        if(!subscription){
          throw new NotFoundError(context.req.t('Subscription { uuid: "{{uuid}}", org_id:{{org_id}} } not found.', {'uuid':uuid, 'org_id':org_id}), context);
        }

        // this may be overkill, but will check for strings first, then groups below
        await validAuth(me, org_id, ACTIONS.SETVERSION, TYPES.SUBSCRIPTION, queryName, context, [subscription.uuid, subscription.name]);

        // validate user has enough cluster groups permissions to for this sub
        // TODO: we should use specific groups action below instead of manage, e.g. setSubscription action
        const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.SETVERSION, 'name', queryName, context);
        if (subscription.groups.some(t => {return allowedGroups.indexOf(t) === -1;})) {
          // if some tag of the sub does not in user's cluster group list, throws an error
          throw new RazeeForbiddenError(context.req.t('You are not allowed to set subscription for all of {{subscription.groups}} groups.', {'subscription.groups':subscription.groups}), context);
        }

        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: subscription.channel_uuid });
        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':subscription.channel_uuid}), context);
        }

        // loads the version
        var version = channel.versions.find((version)=>{
          return (version.uuid == version_uuid);
        });
        if(!version){
          throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':version_uuid}), context);
        }

        var sets = {
          version: version.name,
          version_uuid,
          updated: Date.now(),
        };
        await models.Subscription.updateOne({ uuid, org_id }, { $set: sets });

        pubSub.channelSubChangedFunc({org_id}, context);

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
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    removeSubscription: async (parent, { orgId: org_id, uuid, deleteVersion }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeSubscription';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.DELETE, TYPES.SUBSCRIPTION, queryName, context);

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );

      var success = false;
      try {
        // Experimental
        if( !process.env.EXPERIMENTAL_GITOPS ) {
          // Block experimental features
          if( deleteVersion ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'deleteVersion' } ), context );
          }
        }

        //var subscription = await models.Subscription.findOne({ org_id, uuid });
        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'name', queryName, context);
        logger.debug({req_id, user: whoIs(me), org_id, conditions }, `${queryName} group conditions are...`);
        var subscription = await models.Subscription.findOne({ org_id, uuid, ...conditions }, {});

        if(!subscription){
          throw new NotFoundError(context.req.t('Subscription uuid "{{uuid}}" not found.', {'uuid':uuid}), context);
        }

        await validAuth(me, org_id, ACTIONS.DELETE, TYPES.SUBSCRIPTION, queryName, context, [subscription.uuid, subscription.name]);

        // loads the channel
        var channel = await models.Channel.findOne({ org_id, uuid: subscription.channel_uuid });
        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':subscription.channel_uuid}), context);
        }

        let deployableVersionObj;
        if( deleteVersion ) {
          const subCount = await models.Subscription.count( { org_id, version_uuid: subscription.version_uuid } );
          if( subCount != 1 ) {
            throw new RazeeValidationError( context.req.t( '{{subCount}} other subscription(s) depend on this subscription\'s version. Please update/remove them before removing this subscription and version.', { 'subCount': subCount } ), context );
          }

          // Get the Version
          deployableVersionObj = await models.DeployableVersion.findOne({ org_id, uuid: subscription.version_uuid });
        }

        await subscription.deleteOne();

        if( deleteVersion ) {
          // Attempt to delete version data, version references, and version record
          try {
            // Delete Version data
            if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
              const handler = storageFactory(logger).deserialize( deployableVersionObj.content );
              await handler.deleteData();
              logger.info( {req_id, user: whoIs(me), org_id, ver_uuid: deployableVersionObj.uuid, ver_name: deployableVersionObj.name }, `${queryName} data removed` );
            }

            // Delete Version references
            await models.Channel.updateOne(
              { org_id, uuid: channel.uuid },
              { $pull: { versions: { uuid: uuid } } }
            );
            logger.info( {req_id, user: whoIs(me), org_id, ver_uuid: deployableVersionObj.uuid, ver_name: deployableVersionObj.name }, `${queryName} version reference removed` );

            // Delete the Version record
            await models.DeployableVersion.deleteOne( { org_id, uuid } );
            logger.info( {req_id, user: whoIs(me), org_id, ver_uuid: deployableVersionObj.uuid, ver_name: deployableVersionObj.name }, `${queryName} version deleted` );
          }
          catch(err) {
            logger.error( err, `${queryName} failed to completely delete the version '${deployableVersionObj.name}' / '${deployableVersionObj.uuid}' when serving ${req_id}.` );
            // Cannot fail here, the Subscription has already been removed.  Continue.
          }
        }

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        success = true;
      }
      catch(err){
        if ( err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
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
            throw new RazeeValidationError(context.req.t('No razee-org-key was supplied.'), context);
          }

          const orgId = context.orgId || '';
          if (!orgId) {
            logger.error('No org was found for this org key');
            throw new RazeeValidationError(context.req.t('No org was found for the org key.'), context);
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
