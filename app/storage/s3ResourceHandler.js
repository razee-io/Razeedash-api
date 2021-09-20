/**
 * Copyright 2019 IBM Corp. All Rights Reserved.
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

'use strict';

const conf = require('./../conf.js').conf;
const S3ClientClass = require('./s3NewClient');
const cipher = require('./cipher');
const _ = require('lodash');

class S3ResourceHandler {

  getBucketNameFromBucketConfObj({ bucketConfObj, locationConfig }){
    if(!bucketConfObj || !locationConfig){
      throw new Error('required args: { bucketConfObj, locationConfig }');
    }
    if(bucketConfObj.kind == 'configs'){
      return locationConfig.channelBucket;
    }
    else if(bucketConfObj.kind == 'resources'){
      return locationConfig.resourceBucket;
    }
    throw new Error(`invalid kind "${bucketConfObj.kind}"`);
  }

  constructor(args) {
    let { logger, path, bucketName=null, bucketConfObj=null, location, endpoint, org } = args;
    if(!bucketConfObj && !bucketName){
      throw new Error('Pass a bucketConfObj or bucketName');
    }
    bucketConfObj = bucketConfObj || {};
    if(location){
      bucketConfObj.location = location;
    }
    bucketConfObj.location = bucketConfObj.location || conf.storage.defaultLocation;
    if (bucketConfObj.location) {
      bucketConfObj.location = bucketConfObj.location.toLowerCase();
    }
    const locationConfig = conf.storage.s3ConnectionMap.get(bucketConfObj.location);
    if (!locationConfig) {
      throw new Error(`Storage connection settings for '${bucketConfObj.location}' location are not configured`);
    }
    if(!bucketName){
      bucketName = this.getBucketNameFromBucketConfObj({ bucketConfObj, locationConfig });
    }
    this.logger = logger;
    if (!path || !bucketName) {
      throw new Error(`Path (${path}) and/or bucket name (${bucketName}) is not specified`);
    }
    this.path = path;
    this.bucketName = bucketName;
    this.org = org;



    let config = {
      endpoint: endpoint || locationConfig.endpoint,
      accessKeyId: locationConfig.accessKeyId,
      secretAccessKey: locationConfig.secretAccessKey,
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
      sslEnabled: conf.storage.sslEnabled
    };
    _.assign(this, {
      bucketConfObj,
      config,
    });

    this.s3NewClient = new S3ClientClass({
      logger, config, locationConfig, org
    });
  }

  async setDataAndEncrypt(stringOrBuffer, key) {
    this.logInfo(`Uploading object ${this.bucketName}:${this.path} ...`);
    const { encryptedBuffer, ivText } = cipher.encrypt(stringOrBuffer, key);
    const result = await this.s3NewClient.upload(this.bucketName, this.path, encryptedBuffer);
    this.logInfo(`Uploaded object to ${result.Location}`);
    return ivText;
  }

  async setData(stringOrBuffer) {
    this.logInfo(`Uploading object ${this.bucketName}:${this.path} ...`);
    const result = await this.s3NewClient.upload(this.bucketName, this.path, stringOrBuffer);
    this.logInfo(`Uploaded object to ${result.Location}`);
  }

  async getDataAndDecrypt(key, iv) {
    this.logInfo(`Downloading object ${this.bucketName}:${this.path} ...`);
    const response = await this.s3NewClient.getObject(this.bucketName, this.path);
    const encryptedBuffer = Buffer.from(response.Body);
    return cipher.decryptBuffer(encryptedBuffer, key, iv); // utf-8 text
  }

  async getData() {
    this.logInfo(`Downloading object ${this.bucketName}:${this.path} ...`);
    const response = await this.s3NewClient.getObject(this.bucketName, this.path);
    return Buffer.from(response.Body).toString(); // utf-8 text
  }

  async deleteData() {
    this.logInfo(`Deleting object ${this.bucketName}:${this.path} ...`);
    await this.s3NewClient.deleteObject(this.bucketName, this.path);
  }

  serialize() {
    const out = {
      path: this.path,
      bucketName: this.bucketName,
      location: this.bucketConfObj.location,
      endpoint: this.config.endpoint
    };
    return out;
  }

  logInfo(msg) {
    this.logger.info(msg);
  }
}

const constructor = (args) => {
  return new S3ResourceHandler(args);
};

const deserializer = (args) => {
  const { logger, data } = args;
  return new S3ResourceHandler({
    logger,
    ...data,
  });
};

module.exports = { constructor, deserializer };
