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

const expect = require('chai').expect;

const conf = require('./../conf.js').conf;
const StorageConfig = require('./storageConfig');
const storageFactory = require('./storageFactory');

describe('Embedded resource handler', () => {
  let storageConf;

  const path = 'my-resource-name';
  const bucketName = 'my-bucket-223432r32e';
  const orgKey = 'orgApiKey-63fe2b3a-8c07-45ee-9b34-8eb5ecf27edf';
  const location = undefined; // default will be used

  before(() => {
    storageConf = conf.storage; // save
    conf.storage = new StorageConfig({}); // resources will be embedded
    storageFactory.init();
  });

  after(() => {
    conf.storage = storageConf; // restore
    storageFactory.init();
  });

  it('Embedded resource upload with encryption and download with decryption', async () => {
    let resource = 'my precious resource';

    // Write resource into bucket
    const handler = storageFactory.newResourceHandler(path, bucketName, location);
    const ivText = await handler.setDataAndEncrypt(resource, orgKey);
    const encodedResource = handler.serialize();
    console.log(encodedResource);
    expect(encodedResource.metadata.type).to.equal('embedded');
    expect(encodedResource.data).to.not.equal(resource);

    // Read resource from the bucket
    const getHandler = storageFactory.deserialize(encodedResource);
    const decryptedResource = await getHandler.getDataAndDecrypt(orgKey, ivText);
    console.log(decryptedResource);
    expect(resource).to.equal(decryptedResource);

    // Now delete the bucket
    const delHandler = storageFactory.deserialize(encodedResource);
    await delHandler.deleteData();
    const emptyEncodedResource = delHandler.serialize();

    const emptyHandler = storageFactory.deserialize(emptyEncodedResource);
    try {
      await emptyHandler.getDataAndDecrypt(orgKey, ivText);
      expect.fail('should not reach this point');
    } catch (error) {
      expect(error.message).include('Object data do not exist');
    }
  });

  it('Async write embedded resource into bucket without encryption', async () => {
    const longString = 'x'.repeat(1 * 24 * 1024);

    const handler = storageFactory.newResourceHandler(path, bucketName, 'wdc');
    const promise = handler.setData(longString);
    await promise;
    const encodedData = handler.serialize();
    expect(encodedData.data).to.equal(longString);

    const handlerToo = storageFactory.deserialize(encodedData);
    const longStringCopy = await handlerToo.getData();
    expect(longStringCopy).to.equal(longString);

    await handlerToo.deleteData();
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