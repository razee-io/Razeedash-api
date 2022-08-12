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

const conf = require('../conf.js').conf;
const S3ClientClass = require('./s3NewClient');
const cipher = require('./cipher');
const _ = require('lodash');

class S3LegacyResourceHandler {

  constructor(logger, resourceKey, bucketName, urlString) { // urlString is optional
    this.logger = logger;
    this.resourceKey = resourceKey;
    this.bucketName = bucketName;
    this.urlString = urlString;

    const defaultLocation = conf.storage.defaultLocation;
    if (!defaultLocation) {
      throw new Error('Default S3 storage connection is NOT configured');
    }

    const defaultConfig = conf.storage.s3ConnectionMap.get(defaultLocation);
    if (!defaultConfig) {
      throw new Error(`Storage connection settings for '${defaultLocation}' location are not configured`);
    }

    this.config = {
      endpoint: defaultConfig.endpoint,
      accessKeyId: defaultConfig.accessKeyId,
      secretAccessKey: defaultConfig.secretAccessKey,
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
      sslEnabled: conf.storage.sslEnabled
    };

    this.s3NewClient = new S3ClientClass(this.logger, this.config, defaultConfig.locationConstraint);
  }

  async setDataAndEncrypt(stringOrBuffer, key) {
    this.logInfo(`Uploading object ${this.bucketName}:${this.resourceKey} ...`);
    const { encryptedBuffer, ivText } = cipher.encrypt(stringOrBuffer, key);
    const result = await this.s3NewClient.upload(this.bucketName, this.resourceKey, encryptedBuffer);
    this.urlString = result.Location;
    this.logInfo(`Uploaded object to ${result.Location}`);
    return ivText;
  }

  async setData(stringOrBuffer) {
    this.logInfo(`Uploading object ${this.bucketName}:${this.resourceKey} ...`);
    const result = await this.s3NewClient.upload(this.bucketName, this.resourceKey, stringOrBuffer);
    this.urlString = result.Location;
    this.logInfo(`Uploaded object to ${result.Location}`);
  }

  async getDataAndDecrypt(key, iv) {
    this.logInfo(`Downloading object ${this.bucketName}:${this.resourceKey} ...`);
    const response = await this.s3NewClient.getObject(this.bucketName, this.resourceKey);
    const encryptedBuffer = Buffer.from(response.Body);
    return cipher.decryptBuffer(encryptedBuffer, key, iv); // utf-8 text
  }

  async getData() {
    this.logInfo(`Downloading object ${this.bucketName}:${this.resourceKey} ...`);
    const response = await this.s3NewClient.getObject(this.bucketName, this.resourceKey);
    return Buffer.from(response.Body).toString(); // utf-8 text
  }

  async deleteData() {
    this.logInfo(`Deleting object ${this.bucketName}:${this.resourceKey} ...`);
    await this.s3NewClient.deleteObject(this.bucketName, this.resourceKey);
  }

  serialize() {
    // serialization is not allowed, throw error instead of return this.urlString;
    throw new Error('Legacy resource handler type instances should not be serialized');
  }

  logInfo(msg) {
    this.logger.info(msg);
  }
}

const constructor = (logger, resourceKey, bucketName) => { // location parameter is not used
  return new S3LegacyResourceHandler(logger, resourceKey, bucketName);
};

const deserializer = (logger, urlString) => {
  const urlObj = new URL(urlString);
  const fullPath = urlObj.pathname;
  const parts = _.filter(_.split(fullPath, '/'));
  const bucketName = parts.shift();
  const path = `${parts.join('/')}`;
  return new S3LegacyResourceHandler(logger, decodeURIComponent(path), bucketName, urlString); // endpoint from urlString is not used
};

module.exports = { constructor, deserializer };