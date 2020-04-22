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

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');

const { encryptOrgData, decryptOrgData} = require('../../utils/orgs');

const channelResolvers = {
  Query: {
    channels: async(parent, { org_id }, context) => {
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
    channel: async(parent, { org_id, uuid }, context) => {
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
    getChannelVersion: async(parent, { org_id, channel_uuid, version_uuid }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'getChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, channel_uuid, version_uuid }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context);
      try{

        const org = await models.Organization.findOne({ _id: org_id });
        const orgKey = _.first(org.orgKeys);

        const channel = await models.Channel.findOne({ uuid: channel_uuid, org_id });
        if(!channel){
          throw `Could not find the channel with uuid "${channel_uuid}"`;
        }

        const versionObj = channel.versions.find(v => v.uuid === version_uuid);
        if (!versionObj) {
          throw `versionObj "${version_uuid}" is not found for ${channel.name}:${channel.uuid}.`;
        }

        if (versionObj.location === 'mongo') {  
          const deployableVersionObj = await models.DeployableVersion.findOne({org_id, channel_id: channel_uuid, uuid: version_uuid });
          if (!deployableVersionObj) {
            throw `DeployableVersion is not found for ${channel.name}:${channel.uuid}/${versionObj.name}:${versionObj.uuid}.`;
          }
          deployableVersionObj.content = await decryptOrgData(orgKey, deployableVersionObj.content);
          return deployableVersionObj;
        } else {
          //TODO: implement for S3
          throw 'fix me, not implement for S3 yet';
        }
      }catch(err){
        logger.error(err, `${queryName} encountered an error when serving ${req_id}.`);
        throw err;
      } 
    }
  },
  Mutation: {
    addChannel: async (parent, { org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.CHANNEL, queryName, context);

      try{
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
    editChannel: async (parent, { org_id, uuid, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid, name }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.CHANNEL, queryName, context);

      try{
        const channel = await models.Channel.findOne({ uuid, org_id });
        if(!channel){
          throw `channel uuid "${uuid}" not found`;
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
    addChannelVersion: async(parent, { org_id, channel_uuid, name, type, content, description }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id, channel_uuid, name, type, description }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.CHANNEL, queryName, context);

      // slightly modified code from /app/routes/v1/channelsStream.js. changed to use mongoose and graphql
      const org = await models.Organization.findOne({ _id: org_id });
      const orgKey = _.first(org.orgKeys);

      if(!name){
        throw 'A name was not included';
      }
      if(!type){
        throw 'A "type" of application/json or application/yaml must be included';
      }
      if(!channel_uuid){
        throw 'channel_uuid not specified';
      }

      const channel = await models.Channel.findOne({ uuid: channel_uuid, org_id });
      if(!channel){
        throw `channel uuid "${channel_uuid}" not found`;
      }

      const versions = await models.DeployableVersion.find({ org_id, channel_id: channel_uuid });
      const versionNameExists = !!versions.find((version)=>{
        return (version.name == name);
      });

      if(versionNameExists && versionNameExists.length > 0) {
        throw `The version name ${name} already exists`;
      }

      const iv = crypto.randomBytes(16);
      const ivText = iv.toString('base64');

      const location = 'mongo';

      // todo: enable s3
      // let location, data;
      //
      // if (conf.s3.endpoint) {
      //     try {
      //         const resourceName =  channel.name + '-' + version.name;
      //         const bucket = `${conf.s3.bucketPrefix}-${orgId.toLowerCase()}`;
      //         const s3Client = new S3ClientClass(conf);
      //         try {
      //             const exists = await s3Client.bucketExists(bucket);
      //             if (!exists) {
      //                 logger.warn('bucket does not exist', { bucket });
      //                 await s3Client.createBucket(bucket);
      //             }
      //         } catch (error) {
      //             logger.error('could not create bucket', { bucket: bucket });
      //             throw error;
      //         }
      //         const s3 = new AWS.S3(conf.s3);
      //         const key = Buffer.concat([Buffer.from(req.orgKey)], 32);
      //         const encrypt = crypto.createCipheriv(algorithm, key, iv);
      //         const pipe = req.pipe(encrypt);
      //         const params = {Bucket: bucket, Key: resourceName, Body: pipe};
      //         const upload = s3.upload( params );
      //         await upload.promise();
      //
      //         data = `https://${conf.s3.endpoint}/${bucket}/${resourceName}`;
      //         location = 's3';
      //     } catch (error) {
      //         logger.error( 'S3 upload error', error );
      //         throw error;
      //     }
      // } else {
      //     data = await encryptResource(req);
      //     location = 'mongo';
      // }

      const data = await encryptOrgData(orgKey, content);

      const deployableVersionObj = {
        _id: UUID(),
        org_id,
        uuid: UUID(),
        channel_id: channel.uuid,
        channel_name: channel.name,
        name,
        description,
        content: data,
        iv: ivText,
        type,
      };

      const versionObj = {
        uuid: deployableVersionObj.uuid,
        name, description, location,
      };

      await models.DeployableVersion.create(deployableVersionObj);

      await models.Channel.updateOne(
        { org_id, uuid: channel.uuid },
        { $push: { versions: versionObj } }
      );
      return {
        success: true,
        version_uuid: versionObj.uuid,
      };
    },

    removeChannel: async (parent, { org_id, uuid }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeChannel';
      logger.debug({ req_id, user: whoIs(me), org_id, uuid }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.CHANNEL, queryName, context);

      try{
        const channel = await models.Channel.findOne({ uuid, org_id });
        if(!channel){
          throw `channel uuid "${uuid}" not found`;
        }
        const channel_uuid = channel.uuid;

        const subCount = await models.Subscription.count({ org_id, channel_uuid });

        if(subCount > 0){
          throw `${subCount} subscriptions depend on this channel. Please update/remove them before removing this channel.`;
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
  },
};

module.exports = channelResolvers;
