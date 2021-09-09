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
const { getKmsKeyForOrg } = require('../utils/orgs');
const _ = require('lodash');
const { getRedisClient } = require('../utils/redis');
const RedisLock = require('ioredis-lock');

module.exports = class S3NewClient {

  static bucketCreatePromises = {};

  constructor(logger, config, locationConstraint, { locationConfig, org }) {
    this.logger = logger;
    console.log(3333, config)
    this.s3 = new conf.storage.sdk.S3(config);
    // this.s3.logger = console;
    // this.s3.config.logger = console;
    this.locationConstraint = locationConstraint;
    this.locationConfig = locationConfig;
  }

  async upload(bucketName, path, stringBufferOrStream, { org }={}) {
    try {
      const exists = await this.bucketExists(bucketName);
      if (!exists) {
        this.logger.warn(`bucket '${bucketName}' does not exist, creating it ...`);
        await this.createBucket(bucketName, { org });
        console.log(55555, 'creat bucket is resolved');
      }
    } catch (err) {
      this.logger.error(`could not create bucket '${bucketName}'`, err);
      throw err;
    }

    var s3UploadOptions = {
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

  async createBucket(bucketName, { org=null }={}) {
    // we dont want to run this function multiple times for an org, because then we'll have multiple keys generated
    // this code lets us limit to only running once - even if getting called multiple times
    // first, we keep track of a promise while we're running. if other requests happen before it finishes, we return the currently running promise
    // then we use redisLock to limit to one pod running at any time. (if one's already running, then the lock fails)
    // once we have a lock, we check if the bucket already exists. if so, we exit.
    // then we create the kms key. and create the bucket, providing that key.
    // once thats done, we release the lock and resolve the promise
    console.log(22222, 'promises', S3NewClient.bucketCreatePromises, 22222222, { bucketName });
    if(S3NewClient.bucketCreatePromises[bucketName]){
      console.log('attaching to promise', S3NewClient.bucketCreatePromises[bucketName])
      console.log(66666, 'attached promise resolved val', await S3NewClient.bucketCreatePromises[bucketName]);
      return await S3NewClient.bucketCreatePromises[bucketName];
    }
    console.log('creating promise');
    var p = new Promise(async(resolve, reject)=>{
      try{
        var lockName = `org_create_bucket_${bucketName}`;

        // mutex's the bucket/key creation by creating a redis lock
        var redisClient = await getRedisClient();
        var lock = RedisLock.createLock(redisClient, {
          timeout: 20000,
          retries: 10,
          delay: 1000,
        });
        try {
          console.log(11111, 'aquireing lock', lockName)
          await lock.acquire(lockName);
          console.log(11112, 'got lock', lockName)
        } catch (err) {
          console.log(11113, 'failed to get lock', lockName)
          // if the lock fails, assumes another "thread" is already attempting to create the bucket.
          // so waits for that to finish
          await delay(10000);
        }

        // double checks whether the bucket has already been created
        const exists = await this.bucketExists(bucketName);
        if(exists){
          resolve(true);
          return;
        }

        // if using kms, updates the creation options to specify the key info
        console.log(6666, { locationConfig: this.locationConfig, org })
        if(this.locationConfig.kmsEnabled && org){
          var crn = await getKmsKeyForOrg({ org });
          options = _.assign(options, {
            IBMSSEKPCustomerRootKeyCrn: crn,
            IBMSSEKPEncryptionAlgorithm: 'AES256',
            IBMServiceInstanceId: this.locationConfig.kmsBluemixInstanceGuid,
          });
        }

        var options = {
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: this.locationConstraint,
          },
        };

        // creates the bucket
        var out = this.s3.createBucket(options).promise();

        // resolves the promise with the bucket create info
        resolve(out);

        // unlocks
        await lock.release();
      }
      catch(err){
        reject(err);
      }
      delete S3NewClient.bucketCreatePromises[bucketName];
    });
    S3NewClient.bucketCreatePromises[bucketName] = p;
    console.log('promise created', S3NewClient.bucketCreatePromises);
    return p;
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

};

