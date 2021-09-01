/**
 * Copyright 2021 IBM Corp. All Rights Reserved.
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

module.exports = (logger, location, endpoint) => { // only logger parameter is mandatory
  location = location || conf.storage.defaultLocation;
  if (location) {
    location = location.toLowerCase();
  } else {
    throw new Error('Unable to create S3 client because location parameter is not specified and defaultLocation is not set');
  }

  const locationConfig = conf.storage.s3ConnectionMap.get(location);
  if (!locationConfig) {
    throw new Error(`Storage connection settings for '${location}' location are not configured`);
  }

  const config = {
    endpoint: endpoint || locationConfig.endpoint,
    accessKeyId: locationConfig.accessKeyId,
    secretAccessKey: locationConfig.secretAccessKey,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
    sslEnabled: conf.storage.sslEnabled
  };

  return new S3ClientClass(logger, config, locationConfig.locationConstraint);
};
