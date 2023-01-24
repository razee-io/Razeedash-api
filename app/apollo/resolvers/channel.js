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
const GraphqlFields = require('graphql-fields');
const conf = require('../../conf.js').conf;
const pLimit = require('p-limit');
const { applyQueryFieldsToChannels, applyQueryFieldsToDeployableVersions } = require('../utils/applyQueryFields');
const storageFactory = require('./../../storage/storageFactory');
const { getDecryptedContent, validateNewVersions, ingestVersionContent } = require('../utils/versionUtils');
const { validateNewSubscriptions } = require('../utils/subscriptionUtils');

const { ACTIONS, TYPES, CHANNEL_LIMITS, CHANNEL_CONSTANTS, MAX_REMOTE_PARAMETERS_LENGTH } = require('../models/const');
const { whoIs, validAuth, getAllowedChannels, filterChannelsToAllowed, NotFoundError, RazeeValidationError, BasicRazeeError, RazeeQueryError} = require ('./common');

const { validateString } = require('../utils/directives');

// RBAC Sync
const { subscriptionsRbacSync } = require('../utils/rbacSync');

const { GraphqlPubSub } = require('../subscription');
const pubSub = GraphqlPubSub.getInstance();

const channelResolvers = {
  Query: {
    channels: async(parent, { orgId }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { me, req_id, logger } = context;
      const queryName = 'channels';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.CHANNEL, queryName, context);

      try{
        var channels = await getAllowedChannels(me, orgId, ACTIONS.READ, TYPES.CHANNEL, context);
        await applyQueryFieldsToChannels(channels, queryFields, { orgId }, context);
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new NotFoundError(context.req.t('Query {{queryName}} find error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }

      return channels;
    },
    channel: async(parent, { orgId, uuid }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'channel';
      logger.debug({req_id, user: whoIs(me), orgId, uuid}, `${queryName} enter`);

      try{
        var channel = await models.Channel.findOne({org_id: orgId, uuid });
        if (!channel) {
          throw new NotFoundError(context.req.t('Could not find the configuration channel with uuid {{uuid}}.', {'uuid':uuid}), context);
        }
        await validAuth(me, orgId, ACTIONS.READ, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);
        await applyQueryFieldsToChannels([channel], queryFields, { orgId }, context);
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
      return channel;
    },
    channelByName: async(parent, { orgId, name }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'channelByName';
      logger.debug({req_id, user: whoIs(me), orgId, name}, `${queryName} enter`);

      try{
        const channels = await models.Channel.find({ org_id: orgId, name }).limit(2);

        // If more than one matching config found, throw an error
        if( channels.length > 1 ) {
          logger.info({req_id, user: whoIs(me), org_id: orgId, name }, `${queryName} found ${channels.length} matching configurations` );
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'configuration', 'name':name}), context);
        }
        const channel = channels[0] || null;

        if (!channel) {
          throw new NotFoundError(context.req.t('Could not find the configuration channel with name {{name}}.', {'name':name}), context);
        }
        await validAuth(me, orgId, ACTIONS.READ, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);
        await applyQueryFieldsToChannels([channel], queryFields, { orgId }, context);

        return channel;
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
    channelsByTags: async(parent, { orgId, tags }, context, fullQuery)=>{
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = 'channelsByTags';
      logger.debug({req_id, user: whoIs(me), orgId, tags}, `${queryName} enter`);

      try{
        if(tags.length < 1){
          throw new RazeeValidationError('Please supply one or more tags', context);
        }
        var channels = await models.Channel.find({ org_id: orgId, tags: { $all: tags } });
        channels = await filterChannelsToAllowed(me, orgId, ACTIONS.READ, TYPES.CHANNEL, channels, context);
        await applyQueryFieldsToChannels(channels, queryFields, { orgId }, context);

      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
      return channels;
    },
    channelVersionByName: async(parent, { orgId: org_id, channelName, versionName }, context, fullQuery) => {
      const { me, req_id, logger } = context;
      const queryName = 'channelVersionByName';
      logger.debug({req_id, user: whoIs(me), org_id, channelName, versionName }, `${queryName} enter`);
      return await channelResolvers.Query.channelVersion(parent,  {orgId: org_id, channelName, versionName, _queryName: queryName }, context, fullQuery);
    },

    channelVersion: async(parent, { orgId: org_id, channelUuid, versionUuid, channelName, versionName, _queryName }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const { models, me, req_id, logger } = context;
      const queryName = _queryName ? `${_queryName}/channelVersion` : 'channelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, channelUuid, versionUuid, channelName, versionName}, `${queryName} enter`);

      try{
        const org = await models.Organization.findOne({ _id: org_id });
        if (!org) {
          throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':org_id}), context);
        }

        // search channel by channel uuid or channel name
        const channelFilter = channelName ? { name: channelName, org_id } : { uuid: channelUuid, org_id } ;
        const channels = await models.Channel.find(channelFilter).limit(2).lean({ virtuals: true });

        // If more than one matching channels found, throw an error
        if( channels.length > 1 ) {
          logger.info({req_id, user: whoIs(me), org_id, channelUuid, versionUuid, channelName, versionName }, `${queryName} found ${channels.length} matching configurations` );
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'configuration', 'name':channelName}), context);
        }
        const channel = channels[0] || null;

        if(!channel){
          throw new NotFoundError(context.req.t('Could not find the configuration channel with uuid/name {{channelUuid}}/channelName.', {'channelUuid':channelUuid}), context);
        }
        await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);

        // search version by uuid or name (avoid using deprecated/ignored `versions` attribute of the Channel)
        const deployableVersionFilter = versionName ? { org_id, channel_id: channel.uuid, name: versionName } : { org_id, channel_id: channel.uuid, uuid: versionUuid } ;
        const deployableVersionObjs = await models.DeployableVersion.find(deployableVersionFilter).limit(2);
        const deployableVersionObj = deployableVersionObjs[0] || null;

        // If more than one matching version found, throw an error
        if( deployableVersionObjs.length > 1 ) {
          logger.info({req_id, user: whoIs(me), org_id, channelUuid, versionUuid, channelName, versionName }, `${queryName} found ${deployableVersionObjs.length} matching versions` );
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'DeployableVersion', 'name':versionName||versionUuid}), context);
        }

        // If no matching version found, throw an error
        if (!deployableVersionObj) {
          throw new NotFoundError(context.req.t('DeployableVersion is not found for {{channel.name}}:{{channel.uuid}}/{{versionObj.name}}:{{versionObj.uuid}}.', {'channel.name':channel.name, 'channel.uuid':channel.uuid, 'versionName':versionName, 'versionObj.uuid':versionUuid}), context);
        }

        await applyQueryFieldsToDeployableVersions([ deployableVersionObj ], queryFields, { orgId: org_id }, context);

        // If channel is Uploaded type, replace the `content` attribute with the actual content data string
        if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
          try {
            const decryptedContentResult = await getDecryptedContent( context, org, deployableVersionObj );
            deployableVersionObj.content = decryptedContentResult.content;
          }
          catch( e ) {
            logger.error({req_id, user: whoIs(me), org_id, channelUuid, versionUuid, channelName, versionName }, `${queryName} encountered an error when decrypting version '${deployableVersionObj.uuid}' for request ${req_id}: ${e.message}`);
            throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
          }
        }
        // If channel is Remote type, remove the `content` attribute and set the `remote` attribute instead
        else if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
          deployableVersionObj.remote = deployableVersionObj.content.remote;
          deployableVersionObj.content = null;
        }

        return deployableVersionObj;
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    }
  },
  Mutation: {
    addChannel: async (parent, { orgId: org_id, name, contentType=CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED, data_location, remote, tags=[], custom, versions=[], subscriptions=[] }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.CREATE, TYPES.CHANNEL, queryName, context);

      // Create the channel object to be saved.
      const kubeOwnerId = await models.User.getKubeOwnerId(context);
      const newChannelObj = {
        _id: UUID(),
        uuid: UUID(),
        org_id,
        contentType,
        name,
        versions: [], /* deprecated/ignored, do not use */
        tags,
        ownerId: me._id,
        kubeOwnerId,
        custom,
      };
      if( data_location ) newChannelObj.data_location = data_location;
      if( remote ) newChannelObj.remote = remote;

      validateString( 'org_id', org_id );
      validateString( 'name', name );

      try {
        // Validate contentType
        if( !Object.values(CHANNEL_CONSTANTS.CONTENTTYPES).includes( contentType ) ) {
          throw new RazeeValidationError( context.req.t( 'The content type {{contentType}} is not valid.  Allowed values: [{{contentTypes}}]', { contentType, 'contentTypes': Array.from( Object.values(CHANNEL_CONSTANTS.CONTENTTYPES) ).join(' ') } ), context );
        }

        // get org
        const org = await models.Organization.findOne({ _id: org_id });
        if (!org) {
          throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':org_id}), context);
        }

        // Validate UPLOADED-specific values
        if( contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
          // Normalize
          newChannelObj.data_location = newChannelObj.data_location ? newChannelObj.data_location.toLowerCase() : conf.storage.defaultLocation;
          delete newChannelObj.remote;

          // if there is a list of valid data locations, validate the data_location (if provided) is in the list
          if( Array.from(conf.storage.s3ConnectionMap.keys()).length > 0 ) {
            if( data_location && !conf.storage.s3ConnectionMap.has( data_location ) ) {
              throw new RazeeValidationError(context.req.t('The data location {{data_location}} is not valid.  Allowed values: [{{valid_locations}}]', {'data_location':data_location, 'valid_locations':Array.from(conf.storage.s3ConnectionMap.keys()).join(' ')}), context);
            }
          }
        }
        // Validate REMOTE-specific values
        else if( contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
          // Normalize
          delete newChannelObj.data_location;

          // Validate remote
          if( !remote ) {
            throw new RazeeValidationError( context.req.t( 'Remote version source details must be provided.', {} ), context );
          }

          // Validate remote.remoteType
          if( !remote.remoteType || !Object.values(CHANNEL_CONSTANTS.REMOTE.TYPES).includes( remote.remoteType ) ) {
            throw new RazeeValidationError( context.req.t( 'The remote type {{remoteType}} is not valid.  Allowed values: [{{remoteTypes}}]', { remoteType: remote.remoteType, 'remoteTypes': Array.from( Object.values(CHANNEL_CONSTANTS.REMOTE.TYPES) ).join(' ') } ), context );
          }

          // Validate remote.parameters (length)
          if( remote.parameters && JSON.stringify(remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
            throw new RazeeValidationError( context.req.t( 'The remote version parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
          }
        }

        // Verify name uniqueness.  Might not necessary with unique index, but worth it to return a better error
        const channel = await models.Channel.findOne({ name, org_id });
        if(channel){
          throw new RazeeValidationError(context.req.t('The configuration channel name {{name}} already exists.', {'name':name}), context);
        }

        // Validate the number of total channels is under the limit
        const total = await models.Channel.count({org_id});
        if (total >= CHANNEL_LIMITS.MAX_TOTAL ) {
          throw new RazeeValidationError(context.req.t('Too many configuration channels are registered under {{org_id}}.', {'org_id':org_id}), context);
        }

        // Validate new versions, if any
        await validateNewVersions( org_id, { channel: newChannelObj, newVersions: versions }, context );

        // If adding Subscription(s) at same time as the Channel and Version(s)...
        if( subscriptions.length > 0 ) {
          await validateNewSubscriptions( org_id, { versions: versions, newSubscriptions: subscriptions }, context );
        }

        // Save Channel
        await models.Channel.create( newChannelObj );

        // Attempt to create version(s)
        await Promise.all( versions.map( async (v) => {
          const versionObj = {
            _id: UUID(),
            org_id,
            uuid: UUID(),
            channel_id: newChannelObj.uuid,
            channelName: newChannelObj.name,
            name: v.name,
            description: v.description,
            type: v.type,
            ownerId: me._id,
            kubeOwnerId,
          };

          try {
            // Load/save the version content
            await ingestVersionContent( org_id, { org, channel: newChannelObj, version: versionObj, file: v.file, content: v.content, remote: v.remote }, context );
            // Note: if failure occurs after this point, the data may already have been stored by storageFactory even if the Version document doesnt get saved

            // Save Version
            await models.DeployableVersion.create( versionObj );

            // Keep version uuid for later use when creating subscriptions
            v.uuid = versionObj.uuid;
          }
          catch( e ) {
            logger.error(e, `${queryName} error creating version '${versionObj.name}' when serving ${req_id}.`);
            // Cannot fail here, the Channel has already been created.  Continue.
          }
        } ) );

        // Attempt to create subscription(s)
        await Promise.all( subscriptions.map( async (s) => {
          const version = versions.find( v => v.name === s.versionName );
          if( !version ) {
            logger.error({ req_id, user: whoIs(me), org_id, name }, `${queryName} unable to create subscription '${s.name}' when serving ${req_id}, version '${s.versionName}' was not created.`);
          }
          else if( !version.uuid ) {
            logger.error({ req_id, user: whoIs(me), org_id, name }, `${queryName} unable to create subscription '${s.name}' when serving ${req_id}, version '${s.versionName}' failed creation.`);
          }

          const subscriptionObj = {
            _id: UUID(),
            uuid: UUID(),
            org_id: org_id,
            name: s.name,
            groups: s.groups,
            owner: me._id,
            channelName: newChannelObj.name,
            channel_uuid: newChannelObj.uuid,
            version: version.name,
            version_uuid: version.uuid, // uuid was added to the verison when saving it earlier
            clusterId: null,
            kubeOwnerId: kubeOwnerId,
            custom: s.custom
          };
          try {
            // Save subscription
            await models.Subscription.create( subscriptionObj );

            pubSub.channelSubChangedFunc({org_id: org_id}, context);

            /*
            Trigger RBAC Sync after successful Subscription creation and pubSub.
            RBAC Sync completes asynchronously, so no `await`.
            Even if RBAC Sync errors, subscription creation is successful.
            */
            subscriptionsRbacSync( [subscriptionObj], { resync: false }, context ).catch(function(){/*ignore*/});
          }
          catch( e ) {
            logger.error(e, `${queryName} error creating subscription '${subscriptionObj.name}' when serving ${req_id}.`);
            // Cannot fail here, the Channel has already been created.  Continue.
          }
        } ) );

        return {
          uuid: newChannelObj.uuid,
        };
      } catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
    editChannel: async (parent, { orgId: org_id, uuid, name, tags=[], custom, remote }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid, name }, `${queryName} enter`);

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );
      validateString( 'name', name );

      try{
        const channel = await models.Channel.findOne({ uuid, org_id });
        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':uuid}), context);
        }
        await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);

        // Validate REMOTE-specific values
        if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
          // Validate remote
          if( !remote ) {
            throw new RazeeValidationError( context.req.t( 'Remote version source details must be provided.', {} ), context );
          }

          // Validate remote.remoteType
          if( remote.remoteType ) {
            throw new RazeeValidationError( context.req.t( 'The remote type cannot be changed.  Current value: [{{remoteType}}]', { remoteType: channel.remote.remoteType } ), context );
          }
          remote.remoteType = channel.remote.remoteType;  // keep original remoteType

          // Validate remote.parameters (length)
          if( remote.parameters && JSON.stringify(remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
            throw new RazeeValidationError( context.req.t( 'The remote version parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
          }
        }

        // Save the change
        await models.Channel.updateOne({ org_id, uuid }, { $set: { name, tags, custom, remote, updated: Date.now() } }, {});

        // Attempt to update channelName in all versions and subscriptions under this channel (the duplication is unfortunate and should be eliminated in the future)
        try {
          await models.Subscription.updateMany(
            { org_id: org_id, channel_uuid: uuid },
            { $set: { channelName: name } }
          );
        } catch(err) {
          logger.error(err, `${queryName} failed to update the channel name in subscriptions when serving ${req_id}.`);
          // Cannot fail here, the Channel has already been updated.  Continue.
        }
        try {
          await models.DeployableVersion.updateMany(
            { org_id: org_id, channel_id: uuid },
            { $set: { channel_name: name } }
          );
        } catch(err) {
          logger.error(err, `${queryName} failed to update the channel name in versions when serving ${req_id}.`);
          // Cannot fail here, the Channel has already been updated.  Continue.
        }

        return {
          uuid,
          success: true,
          name,
          tags,
        };
      } catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
    addChannelVersion: async(parent, { orgId: org_id, channelUuid: channel_uuid, name, type, content, file, description, remote, subscriptions=[] }, context)=>{
      const { models, me, req_id, logger } = context;

      // validate org_id, channel_uuid
      validateString( 'org_id', org_id );
      validateString( 'channel_uuid', channel_uuid );

      const queryName = 'addChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, channel_uuid, name, type, description, file }, `${queryName} enter`);

      // get org
      const org = await models.Organization.findOne({ _id: org_id });
      if (!org) {
        throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':org_id}), context);
      }

      // get channel
      const channel = await models.Channel.findOne({ uuid: channel_uuid, org_id });
      if(!channel){
        throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':channel_uuid}), context);
      }

      // create newVersionObj
      const kubeOwnerId = await models.User.getKubeOwnerId(context);
      const newVersionObj = {
        _id: UUID(),
        org_id,
        uuid: UUID(),
        channel_id: channel.uuid,
        channelName: channel.name,
        name,
        description,
        type,
        ownerId: me._id,
        kubeOwnerId,
      };
      if( remote ) newVersionObj.remote = remote;
      if( content ) newVersionObj.content = content;
      if( file ) newVersionObj.file = file;

      // validate authorization on the channel
      await validAuth(me, org_id, ACTIONS.MANAGEVERSION, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);

      // Experimental
      if( !process.env.EXPERIMENTAL_GITOPS_ALT ) {
        // Block experimental features
        if( subscriptions.length > 0 ) {
          throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'subscriptions' } ), context );
        }
      }

      // Validate new version
      await validateNewVersions( org_id, { channel: channel, newVersions: [newVersionObj] }, context );

      // Validate new subscription(s)
      await validateNewSubscriptions( org_id, { versions: [newVersionObj], newSubscriptions: subscriptions }, context );

      // Load/save the version content
      await ingestVersionContent( org_id, { org, channel, version: newVersionObj, file: file, content: content, remote: remote }, context );
      // Note: if failure occurs after this point, the data may already have been stored by storageFactory even if the Version document doesnt get saved

      // Save Version
      await models.DeployableVersion.create( newVersionObj );

      // Attempt to create subscription(s)
      await Promise.all( subscriptions.map( async (s) => {
        const subscription = {
          _id: UUID(),
          uuid: UUID(),
          org_id: org_id,
          name: s.name,
          groups: s.groups,
          owner: me._id,
          channelName: channel.name,
          channel_uuid: channel.uuid,
          version: newVersionObj.name,
          version_uuid: newVersionObj.uuid,
          clusterId: null,
          kubeOwnerId: kubeOwnerId,
          custom: s.custom
        };
        try {
          // Save subscription
          await models.Subscription.create( subscription );

          pubSub.channelSubChangedFunc({org_id: org_id}, context);

          /*
          Trigger RBAC Sync after successful Subscription creation and pubSub.
          RBAC Sync completes asynchronously, so no `await`.
          Even if RBAC Sync errors, subscription creation is successful.
          */
          subscriptionsRbacSync( [subscription], { resync: false }, context ).catch(function(){/*ignore*/});
        }
        catch( e ) {
          logger.error(e, `${queryName} error creating subscription '${subscription.name}' when serving ${req_id}.`);
          // Cannot fail here, the Version has already been created.  Continue.
        }
      } ) );

      return {
        success: true,
        versionUuid: newVersionObj.uuid,
      };
    },
    editChannelVersion: async(parent, { orgId: org_id, uuid, description, remote, subscriptions }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editChannelVersion';

      logger.debug({req_id, user: whoIs(me), org_id, uuid, description, remote }, `${queryName} enter`);

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );

      /*
      - Allow changing description
      - Allow altering `remote.parameters`
      */
      if( !description && !remote ){
        throw new RazeeValidationError( context.req.t( 'No changes specified.' ), context );
      }

      try{
        // Experimental
        if( !process.env.EXPERIMENTAL_GITOPS_ALT ) {
          // Block experimental features
          if( subscriptions ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'subscriptions' } ), context );
          }
        }
        // Block experimental feature even if enabled as it's not fully implemented
        if( subscriptions ) {
          // Note this feature is not full implemented, see commented out code later in this function.  Block even if experimental flag is enabled.
          throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'subscriptions' } ), context );
        }

        // Find version (avoid using deprecated/ignored `versions` attribute on the channel)
        const version = await models.DeployableVersion.findOne( { uuid, org_id } );
        if( !version ){
          throw new NotFoundError( context.req.t( 'Version uuid "{{version_uuid}}" not found.', { 'version_uuid': uuid } ), context );
        }

        const channel = await models.Channel.findOne( { uuid: version.channel_id, org_id } );
        if( !channel ){
          throw new NotFoundError( context.req.t( 'Channel uuid "{{channel_uuid}}" not found.', { 'channel_uuid': version.channel_id } ), context );
        }

        // Verify authorization on the Channel
        await validAuth(me, org_id, ACTIONS.MANAGEVERSION, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);

        const set = {
          updated: Date.now(),
        };

        // Validate REMOTE-specific values
        if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
          if( remote ) {
            // Validate remote.parameters (length)
            if( remote.parameters && JSON.stringify(remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
              throw new RazeeValidationError( context.req.t( 'The remote version parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
            }

            set.content = {
              metadata: {
                type: 'remote',
              },
              remote: { parameters: remote.parameters },
            };
          }
        }

        if( description ) set.description = description;

        // Save the Version
        await models.DeployableVersion.updateOne({ org_id, uuid }, { $set: set }, {});

        /*
        This commented out code provided for illustrative purposes only, and is untested.

        // Attempt to update subscription(s)
        // Get all current subscriptions for this version
        const currentSubscriptions = await model.Subscription.find( { org_id, channel_uuid: channel.uuid, version_uuid: version.uuid } );
        const subUuidsToDelete = currentSubscriptions.map( cs => cs.uuid );
        const subsToUpdate = [];
        const subsToCreate = [];
        for( const ns of subscriptions ) {
          const cs = currentSubscriptions.find( sub => sub.name === ns.name );
          if( cs ) {
            if( ns.groups.sort().join(',') === cs.groups.sort().join(',') ){
              // Same groups, no need to change the subscription.
            }
            else {
              // Groups changed, need to update the subscription
              cs.groups = ns.groups;
              subsToUpdate.push( cs );
            }

            // Whether changed or unchanged, this subscription should not be deleted
            for( let i = 0; i < subUuidsToDelete.length; i++){
              if ( subUuidsToDelete[i] === cs.uuid) subUuidsToDelete.splice(i, 1);
            }
          }
          else {
            // Subscription needs to be created
            subsToCreate.push( ns );
          }
        }

        // delete all current subscriptions not in new subscriptions.
        await models.Subscriptions.deleteMany( { org_id, uuid: { $in: subUuidsToDelete } } );
        // create all new subscriptions not in current subscriptions.
        await Promise.all( subsToCreate.map( async (ns) => {
          const subObj = {
            _id: UUID(),
            uuid: UUID(),
            org_id: org_id,
            name: ns.name,
            groups: ns.groups,
            owner: me._id,
            channelName: channel.name,
            channel_uuid: channel.uuid,
            version: version.name,
            version_uuid: version.uuid,
            clusterId: null,
            kubeOwnerId: kubeOwnerId,
            custom: ns.custom
          };
          await models.Subscription.create( subObj );

          pubSub.channelSubChangedFunc({org_id: org_id}, context);

          / *
          Trigger RBAC Sync after successful Subscription creation and pubSub.
          RBAC Sync completes asynchronously, so no `await`.
          Even if RBAC Sync errors, subscription creation is successful.
          * /
          subscriptionsRbacSync( [ns], { resync: false }, context ).catch(function(){/ * ignore * /});
        } );
        //update all current subscriptions also in new subscriptions that are different.
        await Promise.all( subsToUpdate.map( async (cs) => {
          const set = {
            groups: cs.groups,
            updated: Date.now(),
          };
          await models.Subscription.updateOne( { org_id, uuid: cs.uuid }, { $set: set }, {} );

          pubSub.channelSubChangedFunc({org_id: org_id}, context);

          / *
          Trigger RBAC Sync after successful Subscription creation and pubSub.
          RBAC Sync completes asynchronously, so no `await`.
          Even if RBAC Sync errors, subscription update is successful.
          * /
          subscriptionsRbacSync( [cs], { resync: false }, context ).catch(function(){/ * ignore * /});
        } );
        */

        return {
          success: true,
        };
      }
      catch( err ){
        if( err instanceof BasicRazeeError ) {
          throw err;
        }
        logger.error( err, `${queryName} encountered an error when serving ${req_id}.` );
        throw new RazeeQueryError( context.req.t( 'Query {{queryName}} error. MessageID: {{req_id}}.', { 'queryName': queryName, 'req_id': req_id } ), context );
      }
    },
    removeChannel: async (parent, { orgId: org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid }, `${queryName} enter`);

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );

      try{
        const channel = await models.Channel.findOne({ uuid, org_id });
        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':uuid}), context);
        }
        await validAuth(me, org_id, ACTIONS.DELETE, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);
        const channel_uuid = channel.uuid;

        const subCount = await models.Subscription.count({ org_id, channel_uuid });
        if(subCount > 0){
          throw new RazeeValidationError(context.req.t('{{subCount}} subscription(s) depend on this configuration channel. Please update/remove them before removing this configuration channel.', {'subCount':subCount}), context);
        }

        const serSubCount = await models.ServiceSubscription.count({ channel_uuid });
        if(serSubCount > 0){
          throw new RazeeValidationError(context.req.t('{{serSubCount}} service subscription(s) depend on this channel. Please update/remove them before removing this channel.', {'serSubCount':serSubCount}), context);
        }

        if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
          // deletes the linked deployableVersions data
          var versionsToDeleteFromS3 = await models.DeployableVersion.find({ org_id, channel_id: channel.uuid });
          const limit = pLimit(5);
          await Promise.all(_.map(versionsToDeleteFromS3, deployableVersionObj => {
            return limit(async () => {
              const handler = storageFactory(logger).deserialize(deployableVersionObj.content);
              await handler.deleteData();
            });
          }));
        }

        // Subscriptions are not automatically deleted -- deletion is blocked above if subscriptions or serviceSubscriptions exist

        // Delete the channel's Versions
        await models.DeployableVersion.deleteMany({ org_id, channel_id: channel.uuid });

        // Deletes the configuration channel
        await models.Channel.deleteOne({ org_id, uuid });

        return {
          uuid,
          success: true,
        };
      } catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
    removeChannelVersion: async (parent, { orgId: org_id, uuid, deleteSubscriptions }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeChannelVersion';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid }, `${queryName} enter`);

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );

      try{
        // Experimental
        if( !process.env.EXPERIMENTAL_GITOPS_ALT ) {
          // Block experimental features
          if( deleteSubscriptions ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'deleteSubscriptions' } ), context );
          }
        }

        // Get the Version (avoid using the deprecated/ignored `versions` attribute on the channel)
        const deployableVersionObj = await models.DeployableVersion.findOne({ org_id, uuid });
        if(!deployableVersionObj){
          // If unable to find the Version, throw an error
          throw new NotFoundError(context.req.t('Version uuid "{{version_uuid}}" not found.', {'version_uuid':uuid}), context);
        }

        // Get the Channel for the Version
        const channel = await models.Channel.findOne({ uuid: deployableVersionObj.channel_id, org_id });
        if(!channel){
          // If unable to find the Channel then cannot verify authorization.  Assume deletion allowed rather than throwing an error (else version would be permanently undeletable).
          logger.warn({ver_uuid: uuid, ver_name: deployableVersionObj.name}, `${queryName} channel for version ${uuid} not found, authorization assumed.`);
        }
        else {
          // Channel is found, verify authorization on the Channel
          await validAuth(me, org_id, ACTIONS.MANAGEVERSION, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);
        }

        if( !deleteSubscriptions ) {
          const subCount = await models.Subscription.count({ org_id, version_uuid: uuid });
          if(subCount > 0){
            throw new RazeeValidationError(context.req.t('{{subCount}} subscriptions depend on this configuration channel version. Please update/remove them before removing this configuration channel version.', {'subCount':subCount}), context);
          }
          const serSubCount = await models.ServiceSubscription.count({ version_uuid: uuid });
          if(serSubCount > 0){
            throw new RazeeValidationError(context.req.t('{{serSubCount}} service subscriptions depend on this channel version. Please have them updated/removed before removing this channel version.', {'serSubCount':serSubCount}), context);
          }
        }
        else {
          await models.Subscription.deleteMany({ org_id, version_uuid: uuid });
          await models.ServiceSubscription.deleteMany({ org_id, version_uuid: uuid });
          logger.info({ver_uuid: uuid, ver_name: deployableVersionObj.name}, `${queryName} subscriptions removed`);
        }

        // Delete uploaded Version data
        if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
          const handler = storageFactory(logger).deserialize(deployableVersionObj.content);
          await handler.deleteData();
          logger.info({ver_uuid: uuid, ver_name: deployableVersionObj.name}, `${queryName} data removed`);
        }

        // Delete the Version
        await models.DeployableVersion.deleteOne({ org_id, uuid });
        logger.info({ver_uuid: uuid, ver_name: deployableVersionObj.name}, `${queryName} version deleted`);

        // Return success if Version was deleted
        return {
          uuid,
          success: true,
        };
      } catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
  },
};

module.exports = channelResolvers;
