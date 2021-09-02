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

const StorageConfig = require('./storage/storageConfig');
const EventEmitter = require('events').EventEmitter;
const _ = require('lodash');

let storageConfig = new StorageConfig(process.env);
const confEvents = new EventEmitter();

const conf = {
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://localhost:3001/meteor',
    dbName: process.env.MONGO_DB_NAME || 'meteor',
    cert: '/var/run/secrets/razeeio/razeedash-secret/mongo_cert'
  },
  get storage() {
    return _.cloneDeep(storageConfig);
  },
  set storage(storage) {
    storageConfig = storage;
    confEvents.emit('storage-config-reset');
  },
  on(event, eventHandler) {
    confEvents.on(event, eventHandler);
  },
  maintenance: {
    flag: process.env.MAINTENANCE_FLAG,
    key: process.env.MAINTENANCE_KEY
  },
  kms: {
    server: {
      serviceUrl: process.env.KMS_SERVER_SERVICE_URL || 'https://us-south.kms.cloud.ibm.com',
      iamAuthUrl: process.env.KMS_SERVER_IAM_AUTH_URL || 'https://iam.cloud.ibm.com',
      apiKey: process.env.KMS_SERVER_API_KEY,
      bluemixInstanceGuid: process.env.KMS_SERVER_BLUEMIX_INSTANCE_GUID,
      rootKeyId: process.env.KMS_SERVER_ROOT_KEY_ID,
    },
    cos:{
      enabled: process.env.KMS_COS_ENABLED,
      defaultOrgId: process.env.KMS_COS_DEFAULT_ORG_ID,
      defaultRegion: process.env.KMS_COS_DEFAULT_REGION,
      defaultServiceId: process.env.KMS_COS_DEFAULT_SERVICE_ID,
      defaultRootKeyId: process.env.KMS_COS_DEFAULT_ROOT_KEY_ID,
    },
  },
};

module.exports = {
  conf
};
