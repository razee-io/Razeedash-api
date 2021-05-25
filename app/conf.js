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

const defaultLocation = process.env.S3_DEFAULT_LOCATION || (process.env.S3_WDC_ENDPOINT ? 'WDC' : undefined);
const metroList = process.env.S3_LOCATIONS || defaultLocation;
const metroArr = metroList ? metroList.match(/\S+/g) : [];
const s3ConnectionMap = new Map();

for (let metro of metroArr) {
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
    s3ConnectionMap.set(metro, connection);
  } else {
    throw new Error(`S3 endpoint for location ${metro} is not defnied, possibly missing '${envVar}' env variable.`);
  }
}

const storage = {
  s3ConnectionMap,
  defaultLocation,
  defaultHandler: s3ConnectionMap.size > 0 ? 's3' : 'embedded',
  sdk: process.env.COS_SDK || 'aws-sdk', // also works with 'ibm-cos-sdk' and 'mock-aws-s3'
  sslEnabled: !process.env.S3_DISABLE_SSL, // for local minio support
};

const conf = {
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://localhost:3001/meteor',
    dbName: process.env.MONGO_DB_NAME || 'meteor',
    cert: '/var/run/secrets/razeeio/razeedash-secret/mongo_cert'
  },
  s3: { // TODO: only used by the legacy code and should be deleted ASAP
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    locationConstraint: process.env.S3_LOCATION_CONSTRAINT || 'us-standard',
    channelBucket: process.env.S3_CHANNEL_BUCKET || 'razee',
    resourceBucket: process.env.S3_RESOURCE_BUCKET || process.env.S3_CHANNEL_BUCKET || 'razee',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    sslEnabled: !process.env.S3_DISABLE_SSL, //for local minio support
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
