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
const log = require('../log').log;

let getOrg = require('./orgs').getOrg;

let db = {};

describe('utils', () => {

  describe('orgs', () => {

    before((done) => {
      mongodb.max_delay = 0;
      const MongoClient = mongodb.MongoClient;
      MongoClient.connect('someconnectstring', {}, (err, database) => {
        database.collection('orgs', () => {
          db = database;
          done();
        });
      });
    });

    after(function () {
      db.close();
    });

    it('should return 401 if missing orgKey', async () => {
      // Setup
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
          cluster_id: 'someclusterid'
        },
        log: log,
        db: db
      });
      request._setBody(undefined);

      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, null);
        nextCalled = true;
      };

      await getOrg(request, response, next);

      assert.equal(nextCalled, false);

      assert.equal(response.statusCode, 401);
    });

    it('should return 403 if cannot find org', async () => {
      // Setup
      const Orgs = db.collection('orgs');
      await Orgs.insertOne({ orgKeys: 'dummy', somedata: 'xyz' });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
          cluster_id: 'someclusterid'
        },
        orgKey: 10,
        log: log,
        db: db
      });
      request._setBody(undefined);

      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, null);
        nextCalled = true;
      };

      await getOrg(request, response, next);

      assert.equal(nextCalled, false);

      assert.equal(response.statusCode, 403);
    });

    it('should call next', async () => {
      // Setup
      const Orgs = db.collection('orgs');
      await Orgs.insertOne({ orgKeys: 11, somedata: 'xyz' });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
          cluster_id: 'someclusterid'
        },
        orgKey: 11,
        log: log,
        db: db
      });
      request._setBody(undefined);

      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = () => {
        nextCalled = true;
      };

      await getOrg(request, response, next);

      assert.equal(request.org.somedata, 'xyz');
      assert.equal(nextCalled, true);
    });
  });
});
