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
const streamToString = require('stream-to-string');
const pLimit = require('p-limit');
const { applyQueryFieldsToChannels, applyQueryFieldsToDeployableVersions } = require('../utils/applyQueryFields');
const storageFactory = require('./../../storage/storageFactory');
const yaml = require('js-yaml');
const { bestOrgKey } = require('../../utils/orgs');
const { getDecryptedContent, encryptAndStore } = require('../utils/versionUtils');

const { ACTIONS, TYPES, CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB, CHANNEL_LIMITS, CHANNEL_VERSION_LIMITS, CHANNEL_CONSTANTS, MAX_REMOTE_PARAMETERS_LENGTH } = require('../models/const');
const { whoIs, validAuth, getAllowedChannels, filterChannelsToAllowed, NotFoundError, RazeeValidationError, BasicRazeeError, RazeeQueryError} = require ('./common');

const { validateString } = require('../utils/directives');

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
        const channel_uuid = channel.uuid; // in case query by channelName, populate channel_uuid

        // search version by version uuid or version name
        const versionObjs = channel.versions.filter( v => (v.uuid === versionUuid || v.name === versionName) );

        // If more than one matching version found, throw an error
        if( versionObjs.length > 1 ) {
          logger.info({req_id, user: whoIs(me), org_id, channelUuid, versionUuid, channelName, versionName }, `${queryName} found ${versionObjs.length} matching versions` );
          throw new RazeeValidationError(context.req.t('More than one {{type}} matches {{name}}', {'type':'version', 'name':versionName}), context);
        }

        const versionObj = versionObjs[0] || null;
        if (!versionObj) {
          throw new NotFoundError(context.req.t('versionObj "{{versionUuid}}" is not found for {{channel.name}}:{{channel.uuid}}', {'versionUuid':versionUuid, 'channel.name':channel.name, 'channel.uuid':channel.uuid}), context);
        }

        const version_uuid = versionObj.uuid; // in case query by versionName, populate version_uuid
        const deployableVersionObj = await models.DeployableVersion.findOne({org_id, channel_id: channel_uuid, uuid: version_uuid });
        if (!deployableVersionObj) {
          throw new NotFoundError(context.req.t('DeployableVersion is not found for {{channel.name}}:{{channel.uuid}}/{{versionObj.name}}:{{versionObj.uuid}}.', {'channel.name':channel.name, 'channel.uuid':channel.uuid, 'versionObj.name':versionObj.name, 'versionObj.uuid':versionObj.uuid}), context);
        }
        await applyQueryFieldsToDeployableVersions([ deployableVersionObj ], queryFields, { orgId: org_id }, context);

        // If channel is Uploaded type, replace the `content` attribute with the actual content data string
        if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
          try {
            const decryptedContentResult = await getDecryptedContent( context, org, deployableVersionObj );
            deployableVersionObj.content = decryptedContentResult.content;
          }
          catch( e ) {
            logger.error({req_id, user: whoIs(me), org_id, channelUuid, versionUuid, channelName, versionName }, `${queryName} encountered an error when decrypting version '${versionObj.uuid}' for request ${req_id}: ${e.message}`);
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
    addChannel: async (parent, { orgId: org_id, name, contentType=CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED, data_location, remote, versionDefaults, tags=[], custom }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.CREATE, TYPES.CHANNEL, queryName, context);

      validateString( 'org_id', org_id );
      validateString( 'name', name );

      try {
        // Experimental
        if( !process.env.EXPERIMENTAL_GITOPS ) {
          // Block experimental features
          if( contentType !== CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED || remote || versionDefaults ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'contentType remote versionDefaults' } ), context );
          }
        }
        else {
          // Validate contentType
          if( !Object.values(CHANNEL_CONSTANTS.CONTENTTYPES).includes( contentType ) ) {
            throw new RazeeValidationError( context.req.t( 'The content type {{contentType}} is not valid.  Allowed values: [{{contentTypes}}]', { contentType, 'contentTypes': Array.from( Object.values(CHANNEL_CONSTANTS.CONTENTTYPES) ).join(' ') } ), context );
          }
        }

        // Validate UPLOADED-specific values
        if( contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
          // Normalize
          data_location = data_location ? data_location.toLowerCase() : conf.storage.defaultLocation;
          versionDefaults = null;
          remote = null;

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
          data_location = null;

          // Validate remote
          if( !remote ) {
            throw new RazeeValidationError( context.req.t( 'The remote source details must be provided.', {} ), context );
          }

          // Validate remote.remoteType
          if( !remote.remoteType || !Object.values(CHANNEL_CONSTANTS.REMOTE.TYPES).includes( remote.remoteType ) ) {
            throw new RazeeValidationError( context.req.t( 'The remote type {{remoteType}} is not valid.  Allowed values: [{{remoteTypes}}]', { remoteType: remote.remoteType, 'remoteTypes': Array.from( Object.values(CHANNEL_CONSTANTS.REMOTE.TYPES) ).join(' ') } ), context );
          }

          // Validate remote.parameters (length)
          if( remote.parameters && JSON.stringify(remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
            throw new RazeeValidationError( context.req.t( 'The remote parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
          }

          // Validate versionDefaults content remote parameters (length)
          // Note: versionDefaults only valid for contentType:remote at this time
          if( versionDefaults && versionDefaults.content && versionDefaults.content.remote && versionDefaults.content.remote.parameters && JSON.stringify(versionDefaults.content.remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
            throw new RazeeValidationError( context.req.t( 'The version defaults remote parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
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

        const uuid = UUID();
        const kubeOwnerId = await models.User.getKubeOwnerId(context);

        const newChannelObj = {
          _id: UUID(),
          uuid,
          org_id,
          contentType,
          name,
          versions: [],
          tags,
          ownerId: me._id,
          kubeOwnerId,
          custom,
        };
        if( data_location ) newChannelObj.data_location = data_location;
        if( remote ) newChannelObj.remote = remote;
        if( versionDefaults ) newChannelObj.versionDefaults = versionDefaults;
        await models.Channel.create(newChannelObj);
        return {
          uuid,
        };
      } catch(err){
        if (err instanceof BasicRazeeError) {
          throw err;
        }
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. MessageID: {{req_id}}.', {'queryName':queryName, 'req_id':req_id}), context);
      }
    },
    editChannel: async (parent, { orgId: org_id, uuid, name, tags=[], custom, remote, versionDefaults }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid, name }, `${queryName} enter`);

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );
      validateString( 'name', name );

      try{
        // Experimental
        if( !process.env.EXPERIMENTAL_GITOPS ) {
          // Block experimental features
          if( remote || versionDefaults ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'remote versionDefaults' } ), context );
          }
        }

        const channel = await models.Channel.findOne({ uuid, org_id });
        if(!channel){
          throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':uuid}), context);
        }
        await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);

        // Validate REMOTE-specific values
        if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
          // Validate remote
          if( !remote ) {
            throw new RazeeValidationError( context.req.t( 'The remote source details must be provided.', {} ), context );
          }

          // Validate remote.remoteType
          if( remote.remoteType ) {
            throw new RazeeValidationError( context.req.t( 'The remote type cannot be changed.  Current value: [{{remoteType}}]', { remoteType: channel.remote.remoteType } ), context );
          }

          // Validate remote.parameters (length)
          if( remote.parameters && JSON.stringify(remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
            throw new RazeeValidationError( context.req.t( 'The remote parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
          }

          // Validate versionDefaults content remote parameters (length)
          // Note: versionDefaults only valid for contentType:remote at this time
          if( versionDefaults && versionDefaults.content && versionDefaults.content.remote && versionDefaults.content.remote.parameters && JSON.stringify(versionDefaults.content.remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
            throw new RazeeValidationError( context.req.t( 'The version defaults remote parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
          }
        }

        // Save the change
        await models.Channel.updateOne({ org_id, uuid }, { $set: { name, tags, custom, remote, versionDefaults } }, {});

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
    addChannelVersion: async(parent, { orgId: org_id, channelUuid: channel_uuid, name, type, content, file, description, remote }, context)=>{
      const { models, me, req_id, logger } = context;

      validateString( 'org_id', org_id );
      validateString( 'channel_uuid', channel_uuid );
      validateString( 'name', name );
      validateString( 'type', type );
      if( content ) validateString( 'content', content );

      const queryName = 'addChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, channel_uuid, name, type, description, file }, `${queryName} enter`);

      // Experimental
      if( !process.env.EXPERIMENTAL_GITOPS ) {
        // Block experimental features
        if( remote ) {
          throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'remote' } ), context );
        }
      }

      // slightly modified code from /app/routes/v1/channelsStream.js. changed to use mongoose and graphql

      const org = await models.Organization.findOne({ _id: org_id });
      if (!org) {
        throw new NotFoundError(context.req.t('Could not find the organization with ID {{org_id}}.', {'org_id':org_id}), context);
      }

      if(!name){
        throw new RazeeValidationError(context.req.t('A "name" must be specified'), context);
      }
      if(!channel_uuid){
        throw new RazeeValidationError(context.req.t('A "channel_uuid" must be specified'), context);
      }

      const channel = await models.Channel.findOne({ uuid: channel_uuid, org_id });
      if(!channel){
        throw new NotFoundError(context.req.t('Channel uuid "{{channel_uuid}}" not found.', {'channel_uuid':channel_uuid}), context);
      }

      // Validate UPLOADED-specific values
      if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
        // Normalize
        remote = null;

        if(!type || type !== 'yaml' && type !== 'application/yaml'){
          throw new RazeeValidationError(context.req.t('A "type" of application/yaml must be specified'), context);
        }
        if(!file && !content){
          throw new RazeeValidationError(context.req.t('A "file" or "content" must be specified'), context);
        }
      }
      // Validate REMOTE-specific values
      else if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
        // Normalize
        content = null;
        file = null;

        // Validate remote
        if( !remote ) {
          throw new RazeeValidationError( context.req.t( 'The remote source details must be provided.', {} ), context );
        }

        remote = { parameters: remote.parameters };

        // Validate remote.parameters (length)
        if( remote.parameters && JSON.stringify(remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
          throw new RazeeValidationError( context.req.t( 'The remote parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
        }
      }

      await validAuth(me, org_id, ACTIONS.MANAGEVERSION, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);

      const versions = await models.DeployableVersion.find({ org_id, channel_id: channel_uuid });

      // Prevent duplicate names
      const versionNameExists = !!versions.find((version)=>{
        return (version.name == name);
      });
      if(versionNameExists) {
        throw new RazeeValidationError(context.req.t('The version name {{name}} already exists', {'name':name}), context);
      }

      // validate the number of total configuration channel versions are under the limit
      const total = await models.DeployableVersion.count({org_id, channel_id: channel_uuid});
      if (total >= CHANNEL_VERSION_LIMITS.MAX_TOTAL ) {
        throw new RazeeValidationError(context.req.t('Too many configuration channel versions are registered under {{channel_uuid}}.', {'channel_uuid':channel_uuid}), context);
      }

      const kubeOwnerId = await models.User.getKubeOwnerId(context);
      const deployableVersionObj = {
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

      // If content is UPLOADED, get the content, encrypt and store, and add the results to the Version object
      if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
        try {
          if(file){
            var tempFileStream = (await file).createReadStream();
            content = await streamToString(tempFileStream);
          }
          let yamlSize = Buffer.byteLength(content);
          if(yamlSize > CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB * 1024 * 1024){
            throw new RazeeValidationError(context.req.t('YAML file size should not be more than {{CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB}}mb', {'CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB':CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB}), context);
          }

          yaml.safeLoadAll(content);
        } catch (error) {
          if (error instanceof BasicRazeeError) {
            throw error;
          }
          throw new RazeeValidationError(context.req.t('Provided YAML content is not valid: {{error}}', {'error':error}), context);
        }

        const orgKey = bestOrgKey( org );
        const { data } = await encryptAndStore( context, org, channel, deployableVersionObj, orgKey, content);

        // Note: if failure occurs after this point, the data has already been stored by storageFactory even if the Version document doesnt get saved.

        deployableVersionObj.content = data;
        deployableVersionObj.verifiedOrgKeyUuid = orgKey.orgKeyUuid;
        deployableVersionObj.desiredOrgKeyUuid = orgKey.orgKeyUuid;
      }
      else if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
        deployableVersionObj.content = {
          metadata: {
            type: 'remote',
          },
          remote: remote,
        };
      }

      // Save
      const dObj = await models.DeployableVersion.create(deployableVersionObj);

      // Attempt to update Version references the channel (the duplication is unfortunate and should be eliminated in the future)
      try {
        const versionObj = {
          uuid: deployableVersionObj.uuid,
          name, description,
          created: dObj.created
        };
        await models.Channel.updateOne(
          { org_id, uuid: channel.uuid },
          { $push: { versions: versionObj } }
        );
      } catch(err) {
        logger.error(err, `${queryName} failed to update the channel to reference the new Version '${name}' / '${deployableVersionObj.uuid}' when serving ${req_id}.`);
        // Cannot fail here, the Version has already been created.  Continue.
      }

      return {
        success: true,
        versionUuid: deployableVersionObj.uuid,
      };
    },
    editChannelVersion: async(parent, { orgId: org_id, uuid, description, remote }, context)=>{
      const { /*models,*/ me, req_id, logger } = context;

      validateString( 'org_id', org_id );
      validateString( 'uuid', uuid );

      const queryName = 'editChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, uuid, description, remote }, `${queryName} enter`);

      /*
      Edit Channel Version not yet implemented.
      - Allow changing description
      - Allow altering `remote.parameters`
      */
      throw new RazeeValidationError( context.req.t( 'Unsupported query: {api}', { api: queryName } ), context );
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
        if( !process.env.EXPERIMENTAL_GITOPS ) {
          // Block experimental features
          if( deleteSubscriptions ) {
            throw new RazeeValidationError( context.req.t( 'Unsupported arguments: [{{args}}]', { args: 'deleteSubscriptions' } ), context );
          }
        }

        // Get the Version
        const deployableVersionObj = await models.DeployableVersion.findOne({ org_id, uuid });

        // Get the Channel for the Version
        let channel;
        if( deployableVersionObj ) {
          channel = await models.Channel.findOne({ uuid: deployableVersionObj.channel_id, org_id });
        }
        else {
          channel = await models.Channel.findOne({ versions: { $elemMatch: { uuid: uuid } }, org_id });
        }
        if(!channel){
          // If unable to find the Channel then cannot verify authorization, so throw an error
          throw new NotFoundError(context.req.t('version uuid "{{uuid}}" not found and no references found', {'uuid':uuid}), context);
        }

        // Verify authorization on the Channel
        await validAuth(me, org_id, ACTIONS.MANAGEVERSION, TYPES.CHANNEL, queryName, context, [channel.uuid, channel.name]);

        const name = deployableVersionObj ? deployableVersionObj.name : channel.versions.find( x => x.uuid == uuid ).name;

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
          logger.info({ver_uuid: uuid, ver_name: name}, `${queryName} subscriptions removed`);
        }

        // If the Version is found...
        if(deployableVersionObj){
          if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
            // Delete Version data
            const handler = storageFactory(logger).deserialize(deployableVersionObj.content);
            await handler.deleteData();
            logger.info({ver_uuid: uuid, ver_name: name}, `${queryName} data removed`);
          }

          // Delete the Version
          await models.DeployableVersion.deleteOne({ org_id, uuid });
          logger.info({ver_uuid: uuid, ver_name: name}, `${queryName} version deleted`);
        }

        // Attempt to update Version references the channel (the duplication is unfortunate and should be eliminated in the future)
        try {
          await models.Channel.updateOne(
            { org_id, uuid: channel.uuid },
            { $pull: { versions: { uuid: uuid } } }
          );
          logger.info({ver_uuid: uuid, ver_name: name}, `${queryName} version reference removed`);
        } catch(err) {
          logger.error(err, `${queryName} failed to update the channel to remove the version reference '${name}' / '${uuid}' when serving ${req_id}.`);
          // Cannot fail here, the Version has already been removed.  Continue.
        }

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
