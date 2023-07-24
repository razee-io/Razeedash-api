/**
 * Copyright 2020, 2023 IBM Corp. All Rights Reserved.
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
const { whoIs, checkComplexity, validAuth, validClusterAuth, getGroupConditions, getAllowedResources, filterResourcesToAllowed, getAllowedGroups, getGroupConditionsIncludingEmpty,
  NotFoundError, BasicRazeeError, RazeeValidationError, RazeeQueryError, RazeeForbiddenError } = require ('./common');
const getSubscriptionDetails = require('../../utils/subscriptions.js').getSubscriptionDetails;
const getServiceSubscriptionDetails = require('../../utils/serviceSubscriptions.js').getServiceSubscriptionDetails;
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');
const GraphqlFields = require('graphql-fields');
const { applyQueryFieldsToSubscriptions } = require('../utils/applyQueryFields');
const { ValidationError } = require('apollo-server');

// RBAC Sync
const { subscriptionsRbacSync } = require('../utils/rbacSync');

const pubSub = GraphqlPubSub.getInstance();

const { validateString, validateName } = require('../utils/directives');

const { validateSubscriptionLimit } = require('../utils/subscriptionUtils.js');
const { validateNewVersions, ingestVersionContent } = require('../utils/versionUtils');
const storageFactory = require('./../../storage/storageFactory');

const subscriptionResolvers = {
  Query: {
    subscriptionsByClusterId: async(parent, { clusterId: cluster_id, /* may add some unique data from the cluster later for verification. */ }, context) => {
      const { req_id, me, models, logger } = context;
      const queryName = 'subscriptionsByClusterId';

      const user = whoIs(me);

      try {
        logger.debug({req_id, user, cluster_id}, `${queryName} enter`);

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

        logger.debug({user: 'graphql api user', org_id, clusterGroupNames}, `${queryName} enter`);

        const subs = [];

        // Add in OrgKey rollout and operator update System Subscriptions first, so they are most likely to be rolled out
        subs.push({
          subscriptionUuid: 'system-primaryorgkey',
          subscriptionName: 'system-primaryorgkey',  //Unused, but needs to be included for graphql response
          subscriptionChannel: 'system-primaryorgkey',  //Unused, but needs to be included for graphql response
          subscriptionVersion: 'system-primaryorgkey',  //Unused, but needs to be included for graphql response
          url: 'api/v1/systemSubscriptions/primaryOrgKey',
          kubeOwnerName: null,
        });
        subs.push({
          subscriptionUuid: 'system-operators',
          subscriptionName: 'system-operators',
          subscriptionChannel: 'system-operators',
          subscriptionVersion: 'system-operators',
          url: 'api/v1/systemSubscriptions/operators',
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

        logger.info({org_id, req_id, user, cluster_id, clusterGroupNames}, `${queryName} found ${foundSubscriptions?foundSubscriptions.length:'ERR'} subscriptions for ${clusterGroupNames.length} groups`);

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

        logger.info({org_id, req_id, user, cluster_id, subs, clusterGroupNames}, `${queryName} returning ${subs.length} subscriptions for cluster ${cluster_id}`);
        return subs;
      }
      catch( error ) {
        logger.error({req_id, user, /*org_id,*/ error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    subscriptions: async(parent, { orgId: org_id, tags=null }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { me, req_id, logger } = context;
      const queryName = 'subscriptions';

      const user = whoIs(me);

      logger.debug({req_id, user, org_id}, `${queryName} enter`);

      try {
        const conditions = await getGroupConditions(me, org_id, ACTIONS.READ, 'name', queryName, context);

        logger.debug({req_id, user, org_id, conditions}, `${queryName} group conditions are...`);

        checkComplexity( queryFields );

        const query = { org_id, ...conditions };
        if( tags ) {
          query.tags = { $all: tags };
        }

        const subs = await getAllowedResources(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context, null, null, query);
        logger.info({req_id, user, org_id}, `${queryName} retrieved allowed resources`);


        await applyQueryFieldsToSubscriptions(subs, queryFields, { orgId: org_id }, context);

        return subs;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    subscription: async(parent, { orgId: org_id, uuid, name, _queryName }, context, fullQuery) => {
      const { me, req_id, logger } = context;
      const queryName = _queryName ? `${_queryName}/subscription` : 'subscription';

      const user = whoIs(me);

      logger.debug({req_id, user, org_id, uuid, name}, `${queryName} enter`);

      try {
        let subs = await subscriptionResolvers.Query.subscriptions(parent, { orgId: org_id }, context, fullQuery);
        const matchingSubs = subs.filter( s => {
          return (s.uuid === uuid || s.name === name);
        } );

        // If more than one matching subscription found, throw an error
        if( matchingSubs.length > 1 ) {
          logger.info({req_id, user, org_id, uuid, name}, `${queryName} found ${matchingSubs.length} matching subscriptions` );
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'subscription', 'name':name}), context);
        }
        else if( matchingSubs.length == 0 ) {
          throw new NotFoundError(context.req.t('Subscription not found.'), context);
        }

        return matchingSubs[0];
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    subscriptionByName: async(parent, { orgId: org_id, name }, context, fullQuery) => {
      const { me, req_id, logger } = context;
      const queryName = 'subscriptionByName';

      const user = whoIs(me);

      logger.debug({req_id, user, org_id, name}, `${queryName} enter`);
      return await subscriptionResolvers.Query.subscription(parent, { orgId: org_id, name, _queryName: queryName }, context, fullQuery);
    },

    subscriptionsForCluster: async(parent, { orgId: org_id, clusterId: cluster_id, tags=null }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptionsForCluster';

      const user = whoIs(me);

      logger.debug({req_id, user, org_id }, `${queryName} enter`);

      try {
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating - cluster`);

        checkComplexity( queryFields );

        const cluster = await models.Cluster.findOne({org_id, cluster_id}).lean({ virtuals: true });
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating - found: ${!!cluster}`);

        const identifiers = cluster ? [cluster_id, cluster.registration.name || cluster.name] : [cluster_id];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CLUSTER, queryName, context, identifiers);
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} validating - cluster authorized`);

        if (!cluster) {
          throw new RazeeValidationError(context.req.t('Could not locate the cluster with cluster_id {{cluster_id}}', {'cluster_id':cluster_id}), context);
        }

        let clusterGroupNames = [];
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

        // Return subscriptions that contain any clusterGroupNames passed in from the query
        // examples:
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['dev', 'prod', 'stage'] ==> true
        //   subscription groups: ['dev', 'prod'] , clusterGroupNames: ['stage'] ==> false
        const query = {
          org_id,
          $or: [
            { groups: { $in: clusterGroupNames } },
            { clusterId: cluster_id },
          ],
        };
        if( tags ) {
          query.tags = { $all: tags };
        }

        let subs = await getAllowedResources(me, org_id, ACTIONS.READ, TYPES.SUBSCRIPTION, queryName, context, null, null, query);
        logger.info({req_id, user, org_id, cluster_id}, `${queryName} retrieved allowed subscriptions`);

        subs = subs.map((sub)=>{
          if(_.isUndefined(sub.channelName)){
            sub.channelName = sub.channel;
          }
          return sub;
        });

        await applyQueryFieldsToSubscriptions(subs, queryFields, { orgId: org_id }, context);

        return subs;
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    subscriptionsForClusterByName: async(parent, { orgId: org_id, clusterName, tags=null }, context, fullQuery) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'subscriptionsForClusterByName';

      const user = whoIs(me);

      logger.debug({req_id, user, org_id }, `${queryName} enter`);

      const cluster = await models.Cluster.findOne({org_id, 'registration.name': clusterName}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeValidationError(context.req.t('Could not locate the cluster with clusterName {{clusterName}}', {'clusterName':clusterName}), context);
      }

      // Get and return subscriptions using the cluster uuid
      return await subscriptionResolvers.Query.subscriptionsForCluster( parent, {orgId: org_id, clusterId: cluster.cluster_id, tags}, context, fullQuery);
    }
  },

  Mutation: {
    addSubscription: async (parent, { orgId: org_id, name, groups=[], channelUuid: channel_uuid, versionUuid: version_uuid, version: newVersion, clusterId=null, custom: custom, tags=[] }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addSubscription';

      const user = whoIs(me);

      try {
        logger.info( {req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating` );

        validateString( 'org_id', org_id );
        validateName( 'name', name );
        groups.forEach( value => { validateString( 'groups', value ); } );
        validateString( 'channel_uuid', channel_uuid );
        if( version_uuid ) validateString( 'version_uuid', version_uuid );
        if( clusterId ) validateString( 'clusterId', clusterId );
        tags.forEach( value => { validateString( 'tags', value ); } );

        await validAuth(me, org_id, ACTIONS.CREATE, TYPES.SUBSCRIPTION, queryName, context, [name]);
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - subscription authorized`);

        const kubeOwnerId = await models.User.getKubeOwnerId(context);

        // validate the number of total subscriptions are under the limit
        await validateSubscriptionLimit( org_id, 1, context );

        // loads the channel
        const channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - found: ${!!channel}`);

        const channelIdentifiers = channel ? [channel_uuid, channel.name] : [channel_uuid];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context, channelIdentifiers);
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - channel authorized`);

        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':channel_uuid}), context);
        }

        // loads the groups
        const foundGroups = await models.Group.find({
          org_id,
          $or: [
            { name: { $in: groups } },
            { uuid: { $in: groups } }
          ]
        }).lean({ virtuals: true });
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - found: ${foundGroups.length}`);

        const allowedGroups = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.GROUP, foundGroups, context);
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - allowed: ${allowedGroups.length}`);

        const groupNames = _.map(allowedGroups, group => group.name);

        if( allowedGroups.length < groups.length ) {
          throw new NotFoundError(context.req.t('One or more of the passed groups were not found'));
        }

        // get org
        const org = await models.Organization.findOne({ _id: org_id });
        if (!org) {
          throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':org_id}), context);
        }

        // Get or create the version
        let version;
        // Load the existing version if version_uuid specified (without using deprecated/ignored `versions` attribute on the channel)
        if( version_uuid ) {
          version = await models.DeployableVersion.findOne({org_id, channel_id: channel.uuid, uuid: version_uuid});
          if (!version) {
            throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid': version_uuid }), context);
          }

          logger.info( {req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} saving` );
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

          logger.info( {req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} saving` );

          // Load/save the version content
          await ingestVersionContent( org_id, { org, channel, version: newVersionObj, file: newVersion.file, content: newVersion.content, remote: newVersion.remote }, context );
          // Note: if failure occurs after this point, the data may already have been stored by storageFactory even if the Version document doesnt get saved

          // Save Version
          const dObj = await models.DeployableVersion.create( newVersionObj );
          version = dObj;
        }
        // If neither version_uuid nor newVersion specified, fail validation
        else {
          throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':version_uuid}), context);
        }

        const uuid = UUID();
        const subscription = {
          _id: UUID(),
          uuid,
          org_id,
          name,
          groups: groupNames,
          owner: me._id,
          channelName: channel.name,
          channel_uuid,
          version: version.name,
          version_uuid: version.uuid,
          clusterId,
          kubeOwnerId,
          custom,
          tags
        };
        await models.Subscription.create( subscription );

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        /*
        Trigger RBAC Sync after successful Subscription creation and pubSub.
        RBAC Sync completes asynchronously, so no `await`.
        Even if RBAC Sync errors, subscription creation is successful.
        */
        subscriptionsRbacSync( [subscription], { resync: false }, context ).catch(function(){/*ignore*/});

        // Allow graphQL plugins to retrieve more information. addSubscription can get/create a version and create a subscription. Include details of each created and validated resource in pluginContext.
        context.pluginContext = {channel: {name: channel.name, uuid: channel.uuid, tags: channel.tags}, version: {name: version.name, uuid: version.uuid, description: version.description}, subscription: {name: name, uuid: uuid, groups: groupNames}};

        logger.info( {req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} returning` );
        return {
          uuid,
        };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    editSubscription: async (parent, { orgId: org_id, uuid, name, groups=[], channelUuid: channel_uuid, versionUuid: version_uuid, version: newVersion, clusterId=null, updateClusterIdentity, custom: custom, tags=null }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editSubscription';

      const user = whoIs(me);

      try {
        logger.info( {req_id, user, org_id, uuid, name}, `${queryName} validating` );

        validateString( 'org_id', org_id );
        validateString( 'uuid', uuid );
        validateName( 'name', name );
        groups.forEach( value => { validateString( 'groups', value ); } );
        validateString( 'channel_uuid', channel_uuid );
        if( version_uuid ) validateString( 'version_uuid', version_uuid );
        if( clusterId ) validateString( 'clusterId', clusterId );
        if( tags ) tags.forEach( value => { validateString( 'tags', value ); } );

        const kubeOwnerId = await models.User.getKubeOwnerId(context);

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'name', queryName, context);
        logger.debug({req_id, user, org_id, conditions}, `${queryName} group conditions are...`);

        const subscription = await models.Subscription.findOne({ org_id, uuid, ...conditions }, {}).lean({ virtuals: true });
        logger.info({req_id, user, org_id, uuid, name}, `${queryName} validating - found: ${!!subscription}`);

        const identifiers = subscription ? [uuid, subscription.name] : [uuid];
        await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.SUBSCRIPTION, queryName, context, identifiers);
        logger.info({req_id, user, org_id, uuid, name}, `${queryName} validating - authorized`);

        if (!subscription) {
          throw new NotFoundError(context.req.t('Subscription { uuid: "{{uuid}}", org_id:{{org_id}} } not found.', {'uuid':uuid, 'org_id':org_id}), context);
        }

        // find the channel
        const channel = await models.Channel.findOne({ org_id, uuid: channel_uuid });
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - found: ${!!channel}`);

        const channelIdentifiers = channel ? [channel_uuid, channel.name] : [channel_uuid];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context, channelIdentifiers);
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - channel authorized`);

        if (!channel) {
          throw new NotFoundError(context.req.t('Channel { uuid: "{{uuid}}", org_id:{{org_id}} } not found.', {'uuid':channel_uuid, 'org_id':org_id}), context);
        }

        // find the groups
        const foundGroups = await models.Group.find({
          org_id,
          $or: [
            { name: { $in: groups } },
            { uuid: { $in: groups } }
          ]
        }).lean({ virtuals: true });
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - found: ${foundGroups.length}`);

        const allowedGroups = await filterResourcesToAllowed(me, org_id, ACTIONS.READ, TYPES.GROUP, foundGroups, context);
        logger.info({req_id, user, org_id, name, channel_uuid, version_uuid}, `${queryName} validating - allowed: ${allowedGroups.length}`);

        if(allowedGroups.length < groups.length) {
          throw new NotFoundError(context.req.t('One or more of the passed groups were not found'));
        }

        const groupNames = _.map(allowedGroups, group => group.name);

        const oldVersionUuid = subscription.version_uuid;
        // If neither new version or version_uuid specified, keep the prior version (i.e. set version_uuid)
        if( !newVersion && !version_uuid ) version_uuid = oldVersionUuid;

        // get org
        const org = await models.Organization.findOne({ _id: org_id });
        if (!org) {
          throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':org_id}), context);
        }

        // Retreive version for graphQL plugins
        const oldVersionObj = await models.DeployableVersion.findOne( { org_id, uuid: oldVersionUuid } );

        // Get or create the version
        let version;
        // Load the existing version if version_uuid specified (without using deprecated/ignored `versions` attribute on the channel)
        if( version_uuid ) {
          version = await models.DeployableVersion.findOne({org_id, channel_id: channel.uuid, uuid: version_uuid});
          if (!version) {
            throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid': version_uuid }), context);
          }

          logger.info( {req_id, user, org_id, uuid, name}, `${queryName} saving` );
        }
        // Validate newVersion if specified
        else if( newVersion ) {
          // create newVersionObj
          const newVersionObj = {
            _id: UUID(),
            org_id,
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

          logger.info( {req_id, user, org_id, uuid, name}, `${queryName} saving` );

          // Load/save the version content
          await ingestVersionContent( org_id, { org, channel, version: newVersionObj, file: newVersion.file, content: newVersion.content, remote: newVersion.remote }, context );
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
          groups: groupNames,
          channelName: channel.name,
          channel_uuid,
          version: version.name,
          version_uuid: version.uuid,
          clusterId,
          custom,
          updated: Date.now(),
        };
        if( tags ) sets.tags = tags;  // Update tags if specified, else retain previous value (if any)

        // RBAC Sync
        if( updateClusterIdentity ) {
          sets['owner'] = me._id;
          sets['kubeOwnerId'] = kubeOwnerId;
        }

        await models.Subscription.updateOne({ uuid, org_id }, { $set: sets });

        pubSub.channelSubChangedFunc({ org_id }, context);

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
          for( const group of groupNames ) {
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
          subscription.groups = groupNames;
          subscription.owner = me._id;
          subscriptionsRbacSync( [subscription], { resync: resyncNeeded }, context ).catch(function(){/*ignore*/});
        }

        // If newVersion is specified try to remove the old version
        if( newVersion ) {
          try {
            const subCount = await models.Subscription.count({ org_id, version_uuid: oldVersionUuid });
            if( subCount > 0 ) {
              logger.info( {org_id, req_id, user, subscription: subscription.uuid, ver_uuid: oldVersionUuid}, `${queryName} old version ${oldVersionUuid} is still in use by ${subCount} subscriptions, skipping deletion` );
            }
            else {
              logger.info( {org_id, req_id, user, subscription: subscription.uuid, ver_uuid: oldVersionUuid}, `${queryName} old version ${oldVersionUuid} is replaced by ${version.uuid}, attempting deletion` );

              // Get the old Version
              const deployableVersionObj = await models.DeployableVersion.findOne( { org_id, uuid: oldVersionUuid } );

              // If the Version is found...
              if( deployableVersionObj ){
                if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
                  // Delete Version data
                  const handler = storageFactory(logger).deserialize( deployableVersionObj.content );
                  await handler.deleteData();
                  logger.info( {org_id, req_id, user, subscription: subscription.uuid, ver_uuid: deployableVersionObj.uuid, ver_name: deployableVersionObj.name}, `${queryName} old version ${oldVersionUuid} data removed`);
                }

                // Delete the Version
                await models.DeployableVersion.deleteOne( { org_id, uuid: oldVersionUuid } );
                logger.info( {org_id, req_id, user, subscription: subscription.uuid, ver_uuid: oldVersionUuid}, `${queryName} old version ${oldVersionUuid} deleted` );
              }
            }
          }
          catch(error) {
            logger.error(error, `${queryName} failed to update the channel to remove the version reference '${name}' / '${uuid}' when serving ${req_id}.`);
            // Cannot fail here, the Version has already been removed.  Continue.
          }
        }

        // Allow graphQL plugins to retrieve more information. editSubscription can get or create versions, and edit a subscription. Include details of each created resource in pluginContext.
        context.pluginContext = {channel: {name: channel.name, uuid: channel_uuid, tags: channel.tags}, version: {name: version.name, uuid: version.uuid, description: version.description}, previous_version: {name: oldVersionObj.name, uuid: oldVersionObj.uuid, description: oldVersionObj.description}, subscription: {name, uuid: subscription.uuid, previous_name: subscription.name, groups: subscription.groups}};

        logger.info( {req_id, user, org_id, uuid, name}, `${queryName} returning` );
        return {
          uuid,
          success: true,
        };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    setSubscription: async (parent, { orgId: org_id, uuid, versionUuid: version_uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'setSubscription';

      const user = whoIs(me);

      try {
        logger.info( {req_id, user, org_id, uuid, version_uuid}, `${queryName} validating` );

        validateString( 'org_id', org_id );
        validateString( 'uuid', uuid );
        validateString( 'version_uuid', version_uuid );

        /*
        RBAC Sync:
        setSubscription only changes the Version used by a Subscription, so does
        not need to trigger RBAC Sync (no owner change, no groups change).
        */

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'name', queryName, context);
        logger.debug({req_id, user, org_id, conditions}, `${queryName} group conditions are...`);

        // Find the subscription
        const subscription = await models.Subscription.findOne({ org_id, uuid, ...conditions }, {}).lean({ virtuals: true });
        logger.info({req_id, user, org_id, uuid, version_uuid}, `${queryName} validating - found: ${!!subscription}`);

        const identifiers = subscription ? [uuid, subscription.name] : [uuid];
        await validAuth(me, org_id, ACTIONS.SETVERSION, TYPES.SUBSCRIPTION, queryName, context, identifiers);
        logger.info( {req_id, user, org_id, uuid, version_uuid}, `${queryName} validating - authorized` );

        if (!subscription) {
          throw new NotFoundError(context.req.t('Subscription { uuid: "{{uuid}}", org_id:{{org_id}} } not found.', {'uuid':uuid, 'org_id':org_id}), context);
        }

        // validate user has enough cluster groups permissions to for this sub
        // TODO: we should use specific groups action below instead of manage, e.g. setSubscription action
        const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.SETVERSION, 'name', queryName, context);

        if (subscription.groups.some(t => {return allowedGroups.indexOf(t) === -1;})) {
          // if some tag of the sub does not in user's cluster group list, throws an error
          throw new RazeeForbiddenError(context.req.t('You are not allowed to set subscription for all of {{subscription.groups}} groups.', {'subscription.groups':subscription.groups}), context);
        }

        // Find the channel
        const channel = await models.Channel.findOne({ org_id, uuid: subscription.channel_uuid });
        logger.info({req_id, user, org_id, uuid, version_uuid}, `${queryName} validating - found: ${!!channel}`);

        const channelIdentifiers = channel ? [subscription.channel_uuid, channel.name] : [subscription.channel_uuid];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context, channelIdentifiers);
        logger.info({req_id, user, org_id, uuid, version_uuid}, `${queryName} validating - channel authorized`);

        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':subscription.channel_uuid}), context);
        }

        // Find the version (without using deprecated/ignored `versions` attribute on the channel)
        const version = await models.DeployableVersion.findOne({org_id, channel_id: channel.uuid, uuid: version_uuid});
        if(!version){
          throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':version_uuid}), context);
        }

        logger.info( {req_id, user, org_id, uuid, version_uuid}, `${queryName} saving` );

        // Allow graphQL plugins to retrieve more information. setSubscription can change the subscription version. Include details of each validated resource in pluginContext.
        context.pluginContext = {channel: {name: channel.name, uuid: channel.uuid, tags: channel.tags}, version: {name: version.name, uuid: version.uuid, description: version.description}, subscription: {name: subscription.name, uuid: subscription.uuid, groups: subscription.groups}};

        // Update the subscription
        const sets = {
          version: version.name,
          version_uuid,
          updated: Date.now(),
        };
        await models.Subscription.updateOne({ uuid, org_id }, { $set: sets });

        pubSub.channelSubChangedFunc({org_id}, context);

        logger.info( {req_id, user, org_id, uuid, version_uuid}, `${queryName} returning` );
        return {
          uuid,
          success: true,
        };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },

    removeSubscription: async (parent, { orgId: org_id, uuid, deleteVersion }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeSubscription';

      const user = whoIs(me);

      try {
        logger.info( {req_id, user, org_id, uuid}, `${queryName} validating`);

        validateString( 'org_id', org_id );
        validateString( 'uuid', uuid );

        const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'name', queryName, context);
        logger.debug({req_id, user, org_id, conditions}, `${queryName} group conditions are...`);

        // Find the subscription
        let subscription = await models.Subscription.findOne({ org_id, uuid, ...conditions }, {});
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating - found: ${!!subscription}`);

        const subscriptionIdentifiers = subscription ? [uuid, subscription.name] : [uuid];
        await validAuth(me, org_id, ACTIONS.DELETE, TYPES.SUBSCRIPTION, queryName, context, subscriptionIdentifiers);
        logger.info( {req_id, user, org_id, uuid}, `${queryName} validating - authorized` );

        if (!subscription) {
          throw new NotFoundError(context.req.t('Subscription uuid "{{uuid}}" not found.', {'uuid':uuid}), context);
        }

        // Find the channel
        const channel = await models.Channel.findOne({ org_id, uuid: subscription.channel_uuid });
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating - found: ${!!channel}`);

        const channelIdentifiers = channel ? [subscription.channel_uuid, channel.name] : [subscription.channel_uuid];
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context, channelIdentifiers);
        logger.info({req_id, user, org_id, uuid}, `${queryName} validating - channel authorized`);

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

          // Allow graphQL plugins to retrieve more information. removeSubscription deletes a subscription and can delete associated version if specified. Include details of each deleted resource in pluginContext.
          context.pluginContext = {channel: {name: channel.name, uuid: channel.uuid, tags: channel.tags}, subscription: {name: subscription.name, uuid: subscription.uuid, groups: subscription.groups}, version: {name: deployableVersionObj.name, uuid: deployableVersionObj.uuid, description: deployableVersionObj.description}};
        }
        else {
          // Allow graphQL plugins to retrieve more information. removeSubscription deletes a subscription and can delete associated version if specified. Include null version if non-deleted resource.
          context.pluginContext = {channel: {name: channel.name, uuid: channel.uuid, tags: channel.tags}, subscription: {name: subscription.name, uuid: subscription.uuid, groups: subscription.groups}, version: null};
        }

        logger.info( {req_id, user, org_id, uuid}, `${queryName} saving` );

        await subscription.deleteOne();

        if( deleteVersion ) {
          // Attempt to delete version data, version references, and version record
          try {
            // Delete Version data
            if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
              const handler = storageFactory(logger).deserialize( deployableVersionObj.content );
              await handler.deleteData();
              logger.info( {req_id, user, org_id, ver_uuid: deployableVersionObj.uuid, ver_name: deployableVersionObj.name}, `${queryName} data removed` );
            }

            // Delete the Version record
            await models.DeployableVersion.deleteOne( { org_id, uuid: deployableVersionObj.uuid } );
            logger.info( {req_id, user, org_id, ver_uuid: deployableVersionObj.uuid, ver_name: deployableVersionObj.name}, `${queryName} version deleted` );
          }
          catch(error) {
            logger.error( error, `${queryName} failed to completely delete the version '${deployableVersionObj.name}' / '${deployableVersionObj.uuid}' when serving ${req_id}.`);
            // Cannot fail here, the Subscription has already been removed.  Continue.
          }
        }

        pubSub.channelSubChangedFunc({org_id: org_id}, context);

        logger.info( {req_id, user, org_id, uuid}, `${queryName} returning` );
        return {
          uuid,
          success: true,
        };
      }
      catch( error ) {
        logger.error({req_id, user, org_id, error}, `${queryName} error encountered: ${error.message}`);
        if (error instanceof BasicRazeeError || error instanceof ValidationError) {
          throw error;
        }
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
  },

  Subscription: {
    subscriptionUpdated: {
      // eslint-disable-next-line no-unused-vars
      resolve: async (parent, args) => {
        // Sends a message back to a subscribed client
        // 'parent' is the object representing the subscription that was updated
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
