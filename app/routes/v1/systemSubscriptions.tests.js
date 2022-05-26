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
const assert = require('assert');
const mongodb = require('mongo-mock');
var httpMocks = require('node-mocks-http');
const log = require('../../log').log;
const { v4: uuid } = require('uuid');

const rewire = require('rewire');
let v1 = rewire('./systemSubscriptions');
let db = {};

describe('systemSubscriptions', () => {

  before(async function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    db = await MongoClient.connect('someconnectstring', {});
    db.collection('orgs');
  });

  after(function () {
    db.close();
  });

  describe('getSystemSubscription', () => {
    it('should get primaryOrgKey SystemSubscription', async () => {
      const testOrg = {
        '_id': uuid(),
        'name': 'systemSubscriptionsOrg',
        'orgKeys' : [ 'key123' ],
        'created': new Date(),
        'updated': new Date(),
        'orgKeys2': [
          {
            'orgKeyUuid': 'key456',
            'name': 'OrgKey456',
            'primary': false,
            'created': Date.now(),
            'updated': Date.now(),
            'key': 'key456'
          },
          {
            'orgKeyUuid': 'key789',
            'name': 'OrgKey456',
            'primary': true,
            'created': Date.now(),
            'updated': Date.now(),
            'key': 'key789'
          }
        ]
      };
      //await db.collection('orgs').insertOne();
      const getPrimaryOrgKeySubscription = v1.__get__('getPrimaryOrgKeySubscription');
      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/primaryOrgKey',
        params: { name: 'existingOrg' },
        log: log,
        org: testOrg
      });

      const response = httpMocks.createResponse();
      await getPrimaryOrgKeySubscription(request, response);

      assert.equal(response.statusCode, 200);
      assert.notEqual(response._getData().indexOf( Buffer.from(testOrg.orgKeys2[1].key).toString('base64') ), -1);
    });
  });
});
