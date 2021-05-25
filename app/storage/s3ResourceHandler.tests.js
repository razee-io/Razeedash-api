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

/*
process.env.S3_LOCATIONS = 'WDC LON';
process.env.S3_DEFAULT_LOCATION = 'LON';
process.env.S3_LON_ENDPOINT = 'lon.ibm.com';
process.env.S3_WDC_ENDPOINT = 'wdc.ibm.com';
process.env.COS_SDK = 'mock-aws-s3';
*/

const rewire = require('rewire');
const expect = require('chai').expect;

require('mock-aws-s3').config.basePath = '/tmp/buckets';

const conf = require('./../conf.js').conf;
conf.storage.defaultHandler = 's3';
conf.storage.sdk = 'mock-aws-s3';
const wdcConnection = { endpoint: 'wdc.ibm.com', locationConstraint: 'washington' };
conf.storage.s3ConnectionMap.set('WDC', wdcConnection);
const lonConnection = { endpoint: 'lon.ibm.com', locationConstraint: 'london' };
conf.storage.s3ConnectionMap.set('LON', lonConnection);
conf.storage.defaultLocation = 'LON';

const storageFactory = rewire('./storageFactory');

describe('s3ResourceHandler', () => {
  it('S3 resource upload with encryption and download with decryption', async () => {

    const resource = 'my precious resource';
    const path = 'my-resource-name';
    const bucketName = 'my-bucket-223432r32e';
    const orgKey = 'orgApiKey-63fe2b3a-8c07-45ee-9b34-8eb5ecf27edf';
    const location = undefined; // default will be used

    const s3ClientClass = require('./s3NewClient');
    s3ClientClass.prototype.bucketExists = () => true; // because mock SDK does not have 'headBucket'

    const s3Client = new s3ClientClass();
    await s3Client.createBucket(bucketName);

    // Write resource into bucket
    const handler = storageFactory.newResourceHandler(path, bucketName, location);
    const ivText = await handler.setDataAndEncrypt(resource, orgKey);
    const encodedResource = handler.serialize();
    console.log(encodedResource, ivText);
    expect(encodedResource.metadata.type).to.equal('s3');
    expect(encodedResource.data.location).to.equal('LON');
    expect(encodedResource.data.endpoint).to.equal('lon.ibm.com');

    // Read resource from the bucket
    const getHandler = storageFactory.deserialize(encodedResource);
    const decryptedResource = await getHandler.getDataAndDecrypt(orgKey, ivText);
    console.log(decryptedResource);

    expect(resource).to.equal(decryptedResource);

    const delHandler = storageFactory.deserialize(encodedResource);
    await delHandler.deleteData();
    const emptyEncodedResource = delHandler.serialize();

    const emptyHandler = storageFactory.deserialize(emptyEncodedResource);
    try {
      await emptyHandler.getDataAndDecrypt(orgKey, ivText);
      expect.fail('should not reach this point');
    } catch (error) {
      expect(error.message).include('specified key does not exist');
    }

  });

  it('Object factory must recognize invalid resource encodings', async () => {
    const resource0 = { metadata: null, data: {} };
    expect(() => storageFactory.deserialize(resource0)).to.throw('Invalid metadata structure');

    const resource1 = { metadata: {}, data: {} };
    expect(() => storageFactory.deserialize(resource1)).to.throw('Invalid metadata structure');

    const resource2 = { metadata: { type: null }, data: {} };
    expect(() => storageFactory.deserialize(resource2)).to.throw('Invalid metadata structure');

    const resource3 = { metadata: { type: 'abcd' }, data: {} };
    expect(() => storageFactory.deserialize(resource3)).to.throw('Resource handler implementation for type abcd is not defined');

  });

});