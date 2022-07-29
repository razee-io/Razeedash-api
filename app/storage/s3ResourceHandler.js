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

const conf = require('./../conf.js').conf;
const S3ClientClass = require('./s3NewClient');
const cipher = require('./cipher');
const iv_delim = ' ';

class S3ResourceHandler {

  constructor(logger, resourceKey, bucketName, location, endpoint) {
    this.logger = logger;
    if (!resourceKey || !bucketName) {
      throw new Error(`Path (${resourceKey}) and/or bucket name (${bucketName}) is not specified`);
    }
    this.resourceKey = resourceKey;
    this.bucketName = bucketName;

    this.location = location || conf.storage.defaultLocation;
    if (this.location) {
      this.location = this.location.toLowerCase();
    }

    const locationConfig = conf.storage.s3ConnectionMap.get(this.location);
    if (!locationConfig) {
      throw new Error(`Storage connection settings for '${this.location}' location are not configured`);
    }

    this.config = {
      endpoint: endpoint || locationConfig.endpoint,
      accessKeyId: locationConfig.accessKeyId,
      secretAccessKey: locationConfig.secretAccessKey,
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
      sslEnabled: conf.storage.sslEnabled
    };

    this.s3NewClient = new S3ClientClass(this.logger, this.config, locationConfig.locationConstraint);
  }

  async setDataAndEncrypt(stringOrBuffer, key) {
    this.logInfo(`Uploading encrypted object ${this.bucketName}:${this.resourceKey} ...`);
    const { encryptedBuffer, ivText } = cipher.encrypt(stringOrBuffer, key);
    const ivBuffer = Buffer.from( ivText+iv_delim, 'utf8' );
    const s_combinedBuffer = Buffer.concat( [ivBuffer, encryptedBuffer] );
    const result = await this.s3NewClient.upload(this.bucketName, this.resourceKey, s_combinedBuffer);
    this.logInfo(`Uploaded encrypted object to ${result.Location}`);
  }

  async setData(stringOrBuffer) {
    this.logInfo(`Uploading object ${this.bucketName}:${this.resourceKey} ...`);
    const result = await this.s3NewClient.upload(this.bucketName, this.resourceKey, stringOrBuffer);
    this.logInfo(`Uploaded object to ${result.Location}`);
  }

  // If data embeds iv, ignore passed iv (passed iv only for legacy data)
  async getDataAndDecrypt(key, iv) {
    this.logInfo(`Downloading object ${this.bucketName}:${this.resourceKey} ...`);
    const response = await this.s3NewClient.getObject(this.bucketName, this.resourceKey);
    const encryptedBuffer = Buffer.from(response.Body);

    const delimIdx = encryptedBuffer.indexOf( iv_delim, 0, 'utf8' );
    // If iv is embedded, first 24 bytes are the embedded iv.  The rest of the buffer is the delimiter and the encrypted content, which will be multiples of 8 bytes.
    if( delimIdx == 24 && encryptedBuffer.length % 8 == iv_delim.length ) {
      this.logInfo( `retrieved buffer (len: ${encryptedBuffer.length}) embeds iv` );
      let s_iv = encryptedBuffer.subarray(0,delimIdx).toString('utf8');
      const s_encryptedBuffer = encryptedBuffer.subarray( delimIdx + iv_delim.length );
      return cipher.decryptBuffer(s_encryptedBuffer, key, s_iv); // utf-8 text
    }
    this.logInfo( `retrieved buffer (len: ${encryptedBuffer.length}) does not embed iv` );
    return cipher.decryptBuffer(encryptedBuffer, key, iv);
  }

  async getData() {
    this.logInfo(`Downloading object ${this.bucketName}:${this.resourceKey} ...`);
    const response = await this.s3NewClient.getObject(this.bucketName, this.resourceKey);
    return Buffer.from(response.Body).toString(); // utf-8 text
  }

  async deleteData() {
    this.logInfo(`Deleting object ${this.bucketName}:${this.resourceKey} ...`);
    await this.s3NewClient.deleteObject(this.bucketName, this.resourceKey);
  }

  serialize() {
    return {
      path: this.resourceKey,
      bucketName: this.bucketName,
      location: this.location,
      endpoint: this.config.endpoint
    };
  }

  logInfo(msg) {
    this.logger.info(msg);
  }
}

const constructor = (logger, resourceKey, bucketName, location) => {
  return new S3ResourceHandler(logger, resourceKey, bucketName, location);
};

const deserializer = (logger, data) => {
  return new S3ResourceHandler(logger, data.path, data.bucketName, data.location, data.endpoint);
};

module.exports = { constructor, deserializer };
