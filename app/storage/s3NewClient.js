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

const conf = require('./../conf').conf;

module.exports = class S3NewClient {

  constructor(logger, config, locationConstraint) {
    this.logger = logger;
    this.s3 = new conf.storage.sdk.S3(config);
    this.locationConstraint = locationConstraint;
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

    const awsStream = this.s3.upload({
      Bucket: bucketName,
      Key: path,
      Body: stringBufferOrStream
    });

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

  async getObject(bucketName, key) {
    return this.s3.getObject({
      Bucket: bucketName,
      Key: key
    }).promise();
  }

};

