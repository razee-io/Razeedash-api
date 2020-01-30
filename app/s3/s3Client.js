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
const clone = require('clone');
const AWS = require('aws-sdk');

module.exports = class S3Client {
  constructor(options) {
    let o = clone(options);
    this._conf = o.s3;
    this._aws = new AWS.S3(this._conf);
    this._locationConstraint = o.s3.locationConstraint;
  }

  async createBucket(bucketName) {
    this.log.debug(`Creating bucket ${bucketName}`);
    return this._aws.createBucket({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: this._locationConstraint
      },
    }).promise();
  }

  async createObject(bucketName, key, body) {
    this.log.debug(`Creating object ${bucketName} ${key}`);
    return this._aws.putObject({
      Bucket: bucketName,
      Key: key,
      Body: body
    }).promise();
  }

  async deleteObject(bucketName, key) {
    this.log.debug(`Deleting object ${bucketName} ${key}`);
    return this._aws.deleteObject({
      Bucket: bucketName,
      Key: key
    }).promise();
  }

  getObject(bucketName, key) {
    this.log.debug({ bucket: bucketName, key: key }, 'Getting object');
    return this._aws.getObject({
      Bucket: bucketName,
      Key: key
    });
  }

  async deleteBucket(bucketName) {
    this.log.debug(`Deleting bucket ${bucketName}`);
    return this._aws.deleteBucket({
      Bucket: bucketName
    }).promise();
  }

  async bucketExists(bucketName) {
    try {
      const opts = {
        Bucket: bucketName
      };
      await this._aws.headBucket(opts).promise();
      return true;
    } catch (err) {
      if (err.statusCode >= 400 && err.statusCode < 500) {
        this.log.debug(`Bucket "${bucketName}" not found`);
        return false;
      }
      this.log.error(err, err.stack);
      throw new Error('S3 Error');
    }
  }

  async createBucketAndObject(bucket, key, data) {
    try {
      const exists = await this.bucketExists(bucket);
      if (!exists) {
        this.log.info(`bucket does not ${bucket} exist`);
        await this.createBucket(bucket);
      }
    } catch (err) {
      this.log.error(err);
    }
    return this.createObject(bucket, key, data);
  }

  get endpoint() {
    return this._conf.endpoint;
  }
  
  get log() {
    const nop = {
      error: () => {},
      info: () => {},
      debug: () => {}
    };
    const result = this._log || nop;
    return result;
  }

  set log(logger) {
    this._log = logger;
  }
};
