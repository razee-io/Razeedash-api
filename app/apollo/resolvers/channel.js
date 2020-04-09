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
const uuid = require('uuid').v4;
const crypto = require('crypto');

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth } = require ('./common');

const { encryptOrgData } = require('../../utils/orgs');


const resourceResolvers = {
  Query: {
    channels: async(parent, { org_id }, context) => {
      const { models, me, req_id, logger } = context;
      const queryName = 'channels';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.CHANNEL, queryName, context);

      try{
        var channels = await models.Channel.find({ org_id });
      }catch(err){
        logger.error(err);
        throw err;
      }
      return channels;
    },
  },
  Mutation: {
    addChannel: async (parent, { org_id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addChannel';
      logger.debug({ req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.CHANNEL, queryName, context);

      try{
        const _id = uuid();

        await models.Channel.create({
          _id, org_id, name, uuid: uuid(), versions: [],
        });
        return {
          _id,
        };
      } catch(err){
        logger.error(err);
        throw err;
      }
    },
    editChannel: async (parent, { org_id, _id, name }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'editChannel';
      logger.debug({ req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.CHANNEL, queryName, context);

      try{
        const channel = models.Channel.findOne({ _id, org_id });
        if(!channel){
          throw `channel _id "${_id}" not found`;
        }

        await models.Channel.updateOne({ _id }, { $set: { name } });

        return {
          _id,
          success: true,
          name,
        };
      } catch(err){
        logger.error(err);
        throw err;
      }
    },
    addChannelVersion: async(parent, { org_id, channel_id, name, type, content, description }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'addChannelVersion';
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
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
      if(!channel_id){
        throw 'channel_id not specified';
      }

      const channel = await models.Channel.findOne({ _id: channel_id, org_id });
      if(!channel){
        throw `channel _id "${channel_id}" not found`;
      }

      const versions = await models.DeployableVersion.find({ org_id, channel_id });
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
        _id: uuid(),
        org_id,
        uuid: uuid(),
        channel_id, channel_name: channel.name,
        name, description,
        content: data, iv: ivText, type,
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

    removeChannel: async (parent, { org_id, _id }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'removeChannel';
      logger.debug({ req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.MANAGE, TYPES.CHANNEL, queryName, context);

      try{
        const channel = models.Channel.findOne({ _id, org_id });
        if(!channel){
          throw `channel _id "${_id}" not found`;
        }
        const channel_uuid = channel.uuid;

        const subCount = await models.Subscription.count({ org_id, channel_uuid });

        if(subCount > 0){
          throw `${subCount} subscriptions depend on this channel. Please update/remove them before removing this channel.`;
        }

        await models.Channel.deleteOne({ org_id, _id });

        return {
          _id,
          success: true,
        };
      } catch(err){
        logger.error(err);
        throw err;
      }
    },
  },
};

module.exports = resourceResolvers;
