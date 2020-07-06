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
const crypto = require('crypto');
const conf = require('../../conf.js').conf;
const S3ClientClass = require('../../s3/s3Client');
const { UserInputError, ValidationError } = require('apollo-server');
const { WritableStreamBuffer } = require('stream-buffers');
const stream = require('stream');

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth, NotFoundError} = require ('./common');

const { encryptOrgData, decryptOrgData} = require('../../utils/orgs');

const channelResolvers = {
  Query: {
    channels: async(parent, { orgId: org_id }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'channels';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context);

      try{
        var channels = await models.Channel.find({ org_id });
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
      return channels;
    },
    channel: async(parent, { orgId: org_id, uuid }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'channel';
      logger.debug({req_id, user: whoIs(me), org_id, uuid}, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context);

      try{
        var channel = await models.Channel.findOne({ org_id, uuid });
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
      return channel;
    },
    getChannelVersion: async(parent, { orgId: org_id, channelUuid: channel_uuid, versionUuid: version_uuid }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'getChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, channel_uuid, version_uuid }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context);
      try{

        const org = await models.Organization.findOne({ _id: org_id });
        const orgKey = _.first(org.orgKeys);

        const channel = await models.Channel.findOne({ uuid: channel_uuid, org_id });
        if(!channel){
          throw new NotFoundError(`Could not find the channel with uuid ${channel_uuid}.`);
        }

        const versionObj = channel.versions.find(v => v.uuid === version_uuid);
        if (!versionObj) {
          throw new NotFoundError(`versionObj "${version_uuid}" is not found for ${channel.name}:${channel.uuid}`);
        }

        const deployableVersionObj = await models.DeployableVersion.findOne({org_id, channel_id: channel_uuid, uuid: version_uuid });
        if (!deployableVersionObj) {
          throw `DeployableVersion is not found for ${channel.name}:${channel.uuid}/${versionObj.name}:${versionObj.uuid}.`;
        }

        if (versionObj.location === 'mongo') {
          deployableVersionObj.content = await decryptOrgData(orgKey, deployableVersionObj.content);
        }
        else if(versionObj.location === 's3'){
          const url = deployableVersionObj.content;
          const urlObj = new URL(url);
          const fullPath = urlObj.pathname;
          var parts = _.filter(_.split(fullPath, '/'));
          var bucketName = parts.shift();
          var path = `${parts.join('/')}`;

          const s3Client = new S3ClientClass(conf);
          deployableVersionObj.content = await s3Client.getAndDecryptFile(bucketName, path, orgKey, deployableVersionObj.iv);
        }
        else {
          throw `versionObj.location="${versionObj.location}" not implemented yet`;
        }
        return deployableVersionObj;
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      } 
    }
  },
  Mutation: {
    addChannel: async (parent, { orgId: org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.CREATE, TYPES.CHANNEL, queryName, context);

      try {
        // might not necessary with uunique index. Worth to check to return error better.
        const channel = await models.Channel.findOne({ name, org_id });
        if(channel){
          throw new ValidationError(`The channel name ${name} already exists.`);
        }
        const uuid = UUID();
        await models.Channel.create({
          _id: UUID(),
          uuid, org_id, name, versions: [],
        });
        return {
          uuid,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
    editChannel: async (parent, { orgId: org_id, uuid, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.UPDATE, TYPES.CHANNEL, queryName, context);

      try{
        const channel = await models.Channel.findOne({ uuid, org_id });
        if(!channel){
          throw new NotFoundError(`channel uuid "${uuid}" not found`);
        }

        await models.Channel.updateOne({ org_id, uuid }, { $set: { name } });

        return {
          uuid,
          success: true,
          name,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
    addChannelVersion: async(parent, { orgId: org_id, channelUuid: channel_uuid, name, type, content, file, description }, context)=>{
      const { models, me, req_id, logger } = context;

      const queryName = 'addChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, channel_uuid, name, type, description, file }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGEVERSION, TYPES.CHANNEL, queryName, context);

      // slightly modified code from /app/routes/v1/channelsStream.js. changed to use mongoose and graphql
      const org = await models.Organization.findOne({ _id: org_id });
      const orgKey = _.first(org.orgKeys);

      if(!name){
        throw new UserInputError('A name was not included');
      }
      if(!type){
        throw 'A "type" of application/json or application/yaml must be included';
      }
      if(!channel_uuid){
        throw 'channel_uuid not specified';
      }
      if(!file && !content){
        throw 'Please specify either file or content';
      }

      const channel = await models.Channel.findOne({ uuid: channel_uuid, org_id });
      if(!channel){
        throw new NotFoundError(`channel uuid "${channel_uuid}" not found`);
      }

      const versions = await models.DeployableVersion.find({ org_id, channel_id: channel_uuid });
      const versionNameExists = !!versions.find((version)=>{
        return (version.name == name);
      });

      if(versionNameExists) {
        throw new ValidationError(`The version name ${name} already exists`);
      }

      let fileStream = null;
      if(file){
        fileStream = (await file).createReadStream();
      }
      else{
        fileStream = stream.Readable.from([ content ]);
      }

      const iv = crypto.randomBytes(16);
      const ivText = iv.toString('base64');

      let location = 'mongo';
      let data = null;

      if(conf.s3.endpoint){
        const resourceName = `${org_id.toLowerCase()}-${channel.uuid}-${name}`;
        const bucketName = `${conf.s3.channelBucket}`;

        const s3Client = new S3ClientClass(conf);

        await s3Client.ensureBucketExists(bucketName);

        //data is now the s3 hostpath to the resource
        const result = await s3Client.encryptAndUploadFile(bucketName, resourceName, fileStream, orgKey, iv);
        data = result.url;

        location = 's3';
      }
      else{
        var buf = new WritableStreamBuffer();
        await new Promise((resolve, reject)=>{
          return stream.pipeline(
            fileStream,
            buf,
            (err)=>{
              if(err){
                reject(err);
              }
              resolve(err);
            }
          );
        });
        const content = buf.getContents().toString('utf8');
        data = await encryptOrgData(orgKey, content);
      }

      const deployableVersionObj = {
        _id: UUID(),
        org_id,
        uuid: UUID(),
        channel_id: channel.uuid,
        channel_name: channel.name,
        name,
        description,
        location,
        content: data,
        iv: ivText,
        type,
      };

      const dObj = await models.DeployableVersion.create(deployableVersionObj);
      const versionObj = {
        uuid: deployableVersionObj.uuid,
        name, description, location,
        created: dObj.created
      };

      await models.Channel.updateOne(
        { org_id, uuid: channel.uuid },
        { $push: { versions: versionObj } }
      );
      return {
        success: true,
        versionUuid: versionObj.uuid,
      };
    },
    removeChannel: async (parent, { orgId: org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.DELETE, TYPES.CHANNEL, queryName, context);

      try{
        const channel = await models.Channel.findOne({ uuid, org_id });
        if(!channel){
          throw new NotFoundError(`channel uuid "${uuid}" not found`);
        }
        const channel_uuid = channel.uuid;

        const subCount = await models.Subscription.count({ org_id, channel_uuid });

        if(subCount > 0){
          throw new ValidationError(`${subCount} subscriptions depend on this channel. Please update/remove them before removing this channel.`);
        }

        await models.Channel.deleteOne({ org_id, uuid });

        return {
          uuid,
          success: true,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
    removeChannelVersion: async (parent, { orgId: org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeChannelVersion';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGEVERSION, TYPES.CHANNEL, queryName, context);
      try{
        const deployableVersionObj = await models.DeployableVersion.findOne({ org_id, uuid });
        if(!deployableVersionObj){
          throw new NotFoundError(`version uuid "${uuid}" not found`);
        }
        const subCount = await models.Subscription.count({ org_id, version_uuid: uuid });
        if(subCount > 0){
          throw new ValidationError(`${subCount} subscriptions depend on this channel version. Please update/remove them before removing this channel version.`);
        }
        const channel_uuid = deployableVersionObj.channel_id;
        const channel = await models.Channel.findOne({ uuid: channel_uuid, org_id });
        if(!channel){
          throw new NotFoundError(`channel uuid "${channel_uuid}" not found`);
        }
        const versionObj = channel.versions.find(v => v.uuid === uuid);
        if (!versionObj) {
          throw new NotFoundError(`versionObj "${uuid}" is not found for ${channel.name}:${channel.uuid}`);
        }
        if(versionObj.location === 's3'){
          const url = deployableVersionObj.content;
          const urlObj = new URL(url);
          const fullPath = urlObj.pathname;
          var parts = _.filter(_.split(fullPath, '/'));
          var bucketName = parts.shift();
          var path = `${parts.join('/')}`;

          const s3Client = new S3ClientClass(conf);
          await s3Client.deleteObject(bucketName, path);
        }
        await models.DeployableVersion.deleteOne({ org_id, uuid});
        
        const versionObjs = channel.versions;
        const vIndex = versionObjs.findIndex(v => v.uuid === uuid);
        versionObjs.splice(vIndex, 1);
        await models.Channel.updateOne(
          { org_id, uuid: channel_uuid },
          { versions: versionObjs }
        );
        return {
          uuid,
          success: true,
        };
      } catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      }
    },
  },
};

module.exports = channelResolvers;
