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
const logger = require('./../log').log;

class S3ResourceHandler {

  constructor(resourceKey, bucketName, location, endpoint) {
    if (!resourceKey || !bucketName) {
      throw new Error(`Path (${resourceKey}) and/or bucket name (${bucketName}) is not specified`);
    }
    this.resourceKey = resourceKey;
    this.bucketName = bucketName;

    this.location = location || conf.storage.defaultLocation;
    if (this.location) {
      this.location = this.location.toLowerCase();
    }

    const locationConfig = conf.storage.s3ConnectionMap.get(this.location);
    if (!locationConfig) {
      throw new Error(`Storage connection settings for '${this.location}' location are not configured`);
    }

    this.config = {
      endpoint: endpoint || locationConfig.endpoint,
      accessKeyId: locationConfig.accessKeyId,
      secretAccessKey: locationConfig.secretAccessKey,
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
      sslEnabled: conf.storage.sslEnabled
    };

    this.s3NewClient = new S3ClientClass(this.config, locationConfig.locationConstraint);
  }

  async setDataAndEncrypt(stringOrBuffer, key) {
    this.logInfo(`Uploading object ${this.bucketName}:${this.resourceKey} ...`);
    const { encryptedBuffer, ivText } = cipher.encrypt(stringOrBuffer, key);
    const result = await this.s3NewClient.upload(this.bucketName, this.resourceKey, encryptedBuffer);
    this.logInfo(`Uploaded object to ${result.Location}`);
    return ivText;
  }

  async setData(stringOrBuffer) {
    this.logInfo(`Uploading object ${this.bucketName}:${this.resourceKey} ...`);
    const result = await this.s3NewClient.upload(this.bucketName, this.resourceKey, stringOrBuffer);
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
    return {
      path: this.resourceKey,
      bucketName: this.bucketName,
      location: this.location,
      endpoint: this.config.endpoint
    };
  }

  logInfo(msg) {
    logger.info(msg);
  }
}

const constructor = (resourceKey, bucketName, location) => {
  return new S3ResourceHandler(resourceKey, bucketName, location);
};

const deserializer = (data) => {
  return new S3ResourceHandler(data.path, data.bucketName, data.location, data.endpoint);
};

module.exports = { constructor, deserializer };