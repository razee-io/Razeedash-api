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

const fs = require('fs');
const _ = require('lodash');
const logger = require('./../log').log;

const ResourceStorageHandler = require('./resourceStorageHandler');
const conf = require('../conf').conf;
const configFileName = 'app/storageConfig.json';

const s3legacyType = 's3legacy'; // legacy handler requires special treatment

class StorageFactory {
  constructor() {
    this.handlers = new Map();
    this.logInfo(`Loading storage handler implementations from ${configFileName} ...`);
    const configFile = fs.readFileSync(configFileName);
    const config = JSON.parse(configFile);
    for (const storageType in config) {
      const test = require('./../../' + config[storageType]);
      this.handlers.set(storageType, test);
      this.logInfo(`  loaded handler for type '${storageType}'`);
    }

    this.defaultHandlerType = conf.storage.defaultHandler;
    this.defaultHandler = this.handlers.get(this.defaultHandlerType);

    if (this.defaultHandler === undefined) {
      throw new Error(`Resource handler implementation for ${this.defaultHandlerType} type is not configured`);
    }
  }

  newResourceHandler(resourceKey, bucketName, location) {
    const targetHandler = this.defaultHandler.constructor(resourceKey, bucketName, location);
    return new ResourceStorageHandler(targetHandler, { type: this.defaultHandlerType });
  }

  deserialize(encodedResource) {
    if (this.isLink(encodedResource)) {
      const s3legacyHandler = this.handlers.get(s3legacyType);
      return s3legacyHandler.deserializer(encodedResource);
    }
    /*
        Find required handler type in the metadata and look it up in the handlers map
    */
    if (!encodedResource.metadata || !encodedResource.metadata.type) {
      throw new Error(`Invalid metadata structure: ${encodedResource.metadata}`);
    }
    const handlerType = encodedResource.metadata.type;
    const handler = this.handlers.get(handlerType);
    if (!handler) {
      throw new Error(`Resource handler implementation for type ${handlerType} is not defined`);
    }
    return new ResourceStorageHandler(handler.deserializer(encodedResource.data), encodedResource.metadata);
  }

  logInfo(msg) {
    logger.info(msg);
  }

  isLink(s) {
    return _.isString(s) && /^(http|https):\/\/?/.test(s);
  }

}

module.exports = new StorageFactory();