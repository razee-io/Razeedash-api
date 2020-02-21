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
const uuid = require('uuid');

const rewire = require('rewire');
let v1 = rewire('./subscriptions');
let db = {};

describe('subscriptions', () => {

  before(function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    MongoClient.connect('someconnectstring', {}, function (err, database) {
      database.collection('subscriptions');
      db = database;
    });
  });

  after(function () {
    db.close();
  });

  describe('getSubscriptions', () => {

    it('should retun 500 if there was an error ', async () => {
      const getSubscriptions = v1.__get__('getSubscriptions');
      const request = httpMocks.createRequest({ method: 'GET', url: '/', log: log, db: db });
      const response = httpMocks.createResponse();
      await getSubscriptions(request, response);
      assert.equal(response.statusCode, 500);
    });
    it('should retun 200 if there were no errors', async () => {
      const getSubscriptions = v1.__get__('getSubscriptions');
      const request = httpMocks.createRequest({
        method: 'GET', 
        url: '/', 
        org: {
          _id: '1'
        },
        log: log, 
        db: db 
      });
      const response = httpMocks.createResponse();

      await getSubscriptions(request, response);

      assert.equal(response.statusCode, 200);
    });
    it('should retun a subscriptions object if a subscription was found', async () => {
      const orgId = 'test-org-id';
      await db.collection('subscriptions').insertOne(
        {
          'org_id': orgId,
          'name': 'redis-mini',
          'uuid': '14f5e443-e740-46d3-922d-c9f5f2739cf8',
          'tags': [ 'minikube', 'two' ],
          'channel_uuid': 'bc1a22a4-ac10-4706-b30a-d7d7121b63fd',
          'channel': 'redis',
          'version': '003',
          'version_uuid': 'a8297dda-93ed-4538-8f45-4007caa14160',
          'owner': 'a2T82M3mH2DrwXCsN'
        },
      );
      const getSubscriptions = v1.__get__('getSubscriptions');
      const request = httpMocks.createRequest({
        method: 'GET', 
        url: '/', 
        org: {
          _id: orgId
        },
        log: log, 
        db: db 
      });
      const response = httpMocks.createResponse();

      await getSubscriptions(request, response);
      const data = response._getJSONData();

      assert.equal(response.statusCode, 200);
      assert.equal(data.subscriptions.length, 1);
      assert.equal(data.subscriptions[0].org_id, orgId);
    });

  });

});
