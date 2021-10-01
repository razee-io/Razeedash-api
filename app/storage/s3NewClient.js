/**
 * Copyright 2019, 2021 IBM Corp. All Rights Reserved.
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

const conf = require('./../conf').conf;
const _ = require('lodash');

module.exports = class S3NewClient {

  static bucketCreatePromises = {};

  s3 = null;
  logger = null;
  config = null;
  locationConfig = null;
  org = null;

  constructor({ logger, config, locationConfig, org }) {
    const s3 = new conf.storage.sdk.S3(config);
    _.assign(this, { s3, logger, locationConfig, org });
  }

  async upload(bucketName, path, stringBufferOrStream) {
    try {
      const exists = await this.bucketExists(bucketName);
      if (!exists) {
        this.logger.warn(`bucket '${bucketName}' does not exist, creating it ...`);
        await this.createBucket(bucketName);
      }
    } catch (err) {
      this.logger.error(`could not create bucket '${bucketName}'`, err);
      throw err;
    }

    const s3UploadOptions = {
      Bucket: bucketName,
      Key: path,
      Body: stringBufferOrStream,
      // SSECustomerAlgorithm: 'AES256',
    };
    const awsStream = this.s3.upload(s3UploadOptions);

    return awsStream.promise();
  }

  async bucketExists(bucketName) {
    try {
      const opts = {
        Bucket: bucketName
      };
      await this.s3.headBucket(opts).promise();
      return true;
    } catch (err) {
      if (err.statusCode >= 400 && err.statusCode < 500) {
        this.logger.warn(`Bucket '${bucketName}' not found`);
        return false;
      }
      this.logger.error(err, err.stack);
      throw new Error('S3 Error');
    }
  }

  async createBucket(bucketName) {
    return this.s3.createBucket({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: this.locationConstraint
      },
    }).promise();
  }

  async deleteObject(bucketName, key) {
    return this.s3.deleteObject({
      Bucket: bucketName,
      Key: key
    }).promise();
  }

  async deleteObjects(bucketName, keys) { // array of string keys
    const objects = keys.map(e => ({ Key: e }));
    return this.s3.deleteObjects({
      Bucket: bucketName,
      Delete: {
        Objects: objects
      }
    }).promise();
  }

  async getObject(bucketName, key) {
    return this.s3.getObject({
      Bucket: bucketName,
      Key: key
    }).promise();
  }

  async listBuckets(){
    return this.s3.listBuckets().promise();
  }
};

