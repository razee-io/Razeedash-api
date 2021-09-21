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
const { models } = require('../apollo/models');
const _ = require('lodash');

class S3OrgBucketResourceHandler {
  logger = null;

  constructor(args){
    let { logger, path, bucketConfObj, endpoint, org } = args;
    if (!path || !bucketConfObj) {
      throw new Error(`Path (${path}) and/or bucketConfObj is not specified`);
    }
    if(!org || !org._id){
      throw new Error('An org is required');
    }
    bucketConfObj.location = bucketConfObj.location || conf.storage.defaultLocation;
    if (bucketConfObj.location) {
      bucketConfObj.location = bucketConfObj.location.toLowerCase();
    }
    const locationConfig = conf.storage.s3ConnectionMap.get(bucketConfObj.location);
    if (!locationConfig) {
      throw new Error(`Storage connection settings for '${bucketConfObj.location}' location are not configured`);
    }

    let config = {
      paramValidation: false, // disable validation so we can pass all the non-standard IBM* headers
      endpoint: endpoint || locationConfig.endpoint,
      accessKeyId: locationConfig.accessKeyId,
      secretAccessKey: locationConfig.secretAccessKey,
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
      sslEnabled: conf.storage.sslEnabled,
    };

    _.assign(this, {
      logger,
      path,
      bucketConfObj,
      org,
      config,
      locationConfig,
    });

    this.s3NewClient = new S3ClientClass({
      logger, config, locationConfig, org
    });
  }

  getBucketKey(){
    let { bucketConfObj } = this;
    let { type } = bucketConfObj;
    if(!type){
      throw new Error('bucketConfObj needs attrs: { type }');
    }
    if(type == 'active'){
      let { location, kind } = bucketConfObj;
      if(!location || !kind){
        throw new Error('bucketConfObj of type "active" needs location and kind attrs');
      }
      return `${bucketConfObj.location}_${bucketConfObj.kind}`;
    }
    else if(type == 'backup'){
      let { location, period } = bucketConfObj;
      return `backup_${location}_${period}`;
    }
    else{
      throw new Error(`unhandled type "${type}"`);
    }
  }

  getExistingBucketNameFromOrg(){
    let { org, bucketConfObj } = this;
    let { type, location } = bucketConfObj;
    if(type == 'active'){
      let { kind } = bucketConfObj;
      return _.get(org.buckets, `[${type}][${kind}][${location}]`);
    }
    else if(type == 'backup'){
      let { period } = bucketConfObj;
      return _.get(org.buckets, `[${type}][${period}][${location}]`);
    }
    else{
      throw new Error(`unhandled type "${type}"`);
    }
  }

  async getBucketName(){
    let { org, bucketConfObj } = this;
    let { type, location } = bucketConfObj;
    let bucketKey = this.getBucketKey();

    // checks from db first
    let bucketName = await this.getExistingBucketNameFromOrg();
    if(bucketName){
      return bucketName;
    }
    // if not in db, creates it
    let bucketKeyClean = bucketKey
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_{2,}/g, '_')
    ;
    let uniqId = Math.floor(Math.random()*(36**8)).toString(36);
    bucketName = `${bucketKeyClean}_${org._id}_${uniqId}`;

    await this.s3NewClient.createBucket(bucketName, { bucketKey, org });

    let sets = {};
    if(type == 'active'){
      let { kind } = bucketConfObj;
      sets[`buckets.${type}.${kind}.${location}`] = bucketName;
    }
    else if(type == 'backup'){
      let { period } = bucketConfObj;
      sets[`buckets.${type}.${period}.${location}`] = bucketName;
    }
    else{
      throw new Error(`unhandled type "${type}"`);
    }
    await models.Organization.updateOne({ _id: org._id }, { $set: sets });
    return bucketKey;
  }

  async setDataAndEncrypt(stringOrBuffer, key) {
    let { path, org } = this;
    let bucketName = await this.getBucketName();
    this.logInfo(`Uploading object ${bucketName}:${path} ...`);
    const { encryptedBuffer, ivText } = cipher.encrypt(stringOrBuffer, key);
    const result = await this.s3NewClient.upload(bucketName, path, encryptedBuffer, org);
    this.logInfo(`Uploaded object to ${result.Location}`);
    return ivText;
  }

  async setData(stringOrBuffer) {
    let bucketName = await this.getBucketName();
    this.logInfo(`Uploading object ${bucketName}:${this.path} ...`);
    const result = await this.s3NewClient.upload(bucketName, this.path, stringOrBuffer, { org: this.org });
    this.logInfo(`Uploaded object to ${result.Location}`);
  }

  async getDataAndDecrypt(key, iv) {
    let bucketName = await this.getBucketName();
    this.logInfo(`Downloading object ${bucketName}:${this.path} ...`);
    const response = await this.s3NewClient.getObject(bucketName, this.path);
    const encryptedBuffer = Buffer.from(response.Body);
    return cipher.decryptBuffer(encryptedBuffer, key, iv); // utf-8 text
  }

  async getData() {
    let bucketName = await this.getBucketName();
    this.logInfo(`Downloading object ${bucketName}:${this.path} ...`);
    const response = await this.s3NewClient.getObject(bucketName, this.path);
    return Buffer.from(response.Body).toString(); // utf-8 text
  }

  async deleteData() {
    let bucketName = await this.getBucketName();
    this.logInfo(`Deleting object ${bucketName}:${this.path} ...`);
    await this.s3NewClient.deleteObject(bucketName, this.path);
  }

  serialize() {
    return _.pick(this, ['path', 'bucketConfObj', 'endpoint']);
  }

  logInfo(msg) {
    this.logger.info(msg);
  }
}

const constructor = (args) => {
  return new S3OrgBucketResourceHandler(args);
};

const deserializer = (args) => {
  const { logger, data } = args;
  return new S3OrgBucketResourceHandler({
    logger,
    ...data,
  });
};

module.exports = { constructor, deserializer };
