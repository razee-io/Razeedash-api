/* eslint-env node, mocha */
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

class StorageConfig {
  constructor(env) {
    this.load(env);
  }

  load(env) {
    const metroArray = env.S3_LOCATIONS ? env.S3_LOCATIONS.match(/\S+/g) : [];
    const connectionMap = new Map();
    for (let metro of metroArray) {
      metro = metro.toUpperCase();
      const envVar = 'S3_' + metro + '_ENDPOINT';
      const endpoint = env[envVar]; // ex. S3_WDC_ENDPOINT
      if (endpoint) {
        const connection = { endpoint };
        connection.accessKeyId = env['S3_' + metro + '_ACCESS_KEY_ID'];
        connection.secretAccessKey = env['S3_' + metro + '_SECRET_ACCESS_KEY'];
        connection.locationConstraint = env['S3_' + metro + '_LOCATION_CONSTRAINT'];
        connection.s3ForcePathStyle = true;
        connection.signatureVersion = 'v4';
        connection.channelBucket = env['S3_' + metro + '_CHANNEL_BUCKET'] || env.S3_CHANNEL_BUCKET || 'razee';
        connection.resourceBucket = env['S3_' + metro + '_RESOURCE_BUCKET'] || env.S3_RESOURCE_BUCKET || connection.channelBucket || 'razee';
        connectionMap.set(metro.toLowerCase(), connection);
      } else {
        throw new Error(`S3 endpoint for location '${metro}' is not defnied, possibly missing '${envVar}' env variable.`);
      }
    }

    this.s3ConnectionMap = connectionMap;

    if (this.s3ConnectionMap.size > 0) {
      this.defaultLocation = this.s3ConnectionMap.size > 0 ? (env.S3_DEFAULT_LOCATION || metroArray[0]).toLowerCase() : undefined;
      this.sslEnabled = !env.S3_DISABLE_SSL; // for local minio support
      this.sdk = require(env.COS_SDK || 'aws-sdk'); // also works with 'ibm-cos-sdk' and 'mock-aws-s3'
      this.defaultHandler = 's3';
    } else {
      this.defaultHandler = 'embedded';
    }
  }

  getChannelBucket(location) {
    location = location ? location.toLowerCase() : this.defaultLocation;
    const connection = this.s3ConnectionMap.get(location);
    return connection ? connection.channelBucket : undefined;
  }

  getResourceBucket(location) {
    location = location ? location.toLowerCase() : this.defaultLocation;
    const connection = this.s3ConnectionMap.get(location);
    return connection ? connection.resourceBucket : undefined;
  }
}

module.exports = StorageConfig;