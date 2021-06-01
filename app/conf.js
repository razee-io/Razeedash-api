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

const metroArray = process.env.S3_LOCATIONS ? process.env.S3_LOCATIONS.match(/\S+/g) : [];
const s3ConnectionMap = new Map();
for (let metro of metroArray) {
  metro = metro.toUpperCase();
  const envVar = 'S3_' + metro + '_ENDPOINT';
  const endpoint = process.env[envVar]; // ex. S3_WDC_ENDPOINT
  if (endpoint) {
    const connection = { endpoint };
    connection.accessKeyId = process.env['S3_' + metro + '_ACCESS_KEY_ID'];
    connection.secretAccessKey = process.env['S3_' + metro + '_SECRET_ACCESS_KEY'];
    connection.locationConstraint = process.env['S3_' + metro + '_LOCATION_CONSTRAINT'];
    connection.s3ForcePathStyle = true;
    connection.signatureVersion = 'v4';
    connection.channelBucket = process.env['S3_' + metro + '_CHANNEL_BUCKET'] || process.env.S3_CHANNEL_BUCKET || 'razee';
    connection.resourceBucket = process.env['S3_' + metro + '_RESOURCE_BUCKET'] || process.env.S3_RESOURCE_BUCKET || connection.channelBucket || 'razee';
    s3ConnectionMap.set(metro.toLowerCase(), connection);
  } else {
    throw new Error(`S3 endpoint for location '${metro}' is not defnied, possibly missing '${envVar}' env variable.`);
  }
}

const defaultLocation = s3ConnectionMap.size > 0 ? (process.env.S3_DEFAULT_LOCATION || metroArray[0]).toLowerCase() : undefined;

const storage = {
  s3ConnectionMap,
  defaultLocation,
  defaultHandler: s3ConnectionMap.size > 0 ? 's3' : 'embedded',
  sdk: process.env.COS_SDK || 'aws-sdk', // also works with 'ibm-cos-sdk' and 'mock-aws-s3'
  sslEnabled: !process.env.S3_DISABLE_SSL, // for local minio support

  getChannelBucket: (location) => {
    location = location ? location.toLowerCase() : storage.defaultLocation;
    const connection = storage.s3ConnectionMap.get(location);
    return connection ? connection.channelBucket : undefined;
  },
  getResourceBucket: (location) => {
    location = location ? location.toLowerCase() : storage.defaultLocation;
    const connection = storage.s3ConnectionMap.get(location);
    return connection ? connection.resourceBucket: undefined;
  }
};

const conf = {
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://localhost:3001/meteor',
    dbName: process.env.MONGO_DB_NAME || 'meteor',
    cert: '/var/run/secrets/razeeio/razeedash-secret/mongo_cert'
  },
  storage: storage,
  maintenance: {
    flag: process.env.MAINTENANCE_FLAG,
    key: process.env.MAINTENANCE_KEY
  }
};

module.exports = {
  conf
};
