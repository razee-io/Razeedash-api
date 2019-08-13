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

const rewire = require('rewire');
let v2 = rewire('./webhooks');
const { WEBHOOK_TRIGGER_CLUSTER } = require('../../utils/webhook');
let db = {};
let req = {};

describe('webhooks', () => {
  beforeEach((done) => {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    MongoClient.connect('someconnectstring', {}, async (err, database) => {
      try {
        const Clusters = database.collection('clusters');
        database.collection('webhooks');
        database.collection('images');
        db = database;
        await Clusters.insertOne({
          org_id: 1,
          cluster_id: 'myclusterid',
          metadata: {
            name: 'staging'
          }
        });
        await Clusters.insertOne({
          org_id: 1,
          cluster_id: 'deletedCluster',
          deleted: true,
          metadata: {
            name: 'staging'
          }
        });
        done();
      } catch (err) {
        console.log(err);
      }
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('addWebhook', () => {
    it('should throw error', async () => {
      // Setup
      let addWebhook = v2.__get__('addWebhook');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/',
        org: {
          _id: 1
        },
        log: log,
        body: {
          cluster_id: 'myclusterid',
          trigger: 'cluster',
          kind: 'Deployment',
          service_url: 'http://myfakeservice'
        }
      });
      // eslint-disable-next-line require-atomic-updates
      request.db = {
        collection: () => { throw new Error('oops'); },
        close: () => { return; }
      };
      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, 'oops');
        nextCalled = true;
      };

      await addWebhook(request, response, next);
      assert.equal(nextCalled, true);
    });

    it('success 201', async () => {
      // Setup
      let addWebhook = v2.__get__('addWebhook');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/',
        org: {
          _id: 1
        },
        log: log,
        body: {
          cluster_id: 'myclusterid',
          trigger: WEBHOOK_TRIGGER_CLUSTER,
          kind: 'Deployment',
          service_url: 'http://myfakeservice'
        },
        db: db
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addWebhook(request, response, next);

      assert.equal(response.statusCode, 201);
    });
    it('should return 404', async () => {
      // Setup
      let addWebhook = v2.__get__('addWebhook');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/',
        org: {
          _id: 1
        },
        log: log,
        body: {
          cluster_id: 'deletedCluster',
          trigger: WEBHOOK_TRIGGER_CLUSTER,
          kind: 'Deployment',
          service_url: 'http://myfakeservice'
        },
        db: db
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addWebhook(request, response, next);
      assert.equal(response.statusCode, 404);
    });
  });
  describe('deleteWebhook', () => {
    it('should throw error', async () => {
      // Setup
      let deleteWebhook = v2.__get__('deleteWebhook');
      var request = httpMocks.createRequest({
        method: 'DELETE', params: {
          webhook_id: 'webhookRoutesWebhookId1'
        },
        org: {
          _id: 1
        },
        log: log,
      });
      // eslint-disable-next-line require-atomic-updates
      request.db = {
        collection: () => { throw new Error('oops'); },
        close: () => { }
      };
      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, 'oops');
        nextCalled = true;
      };

      await deleteWebhook(request, response, next);
      request.db.close();
      assert.equal(nextCalled, true);
    });

    it('should return 201', async () => {
      // Setup
      const Webhooks = db.collection('webhooks');
      await Webhooks.insertOne({
        _id: 'webhookRoutesWebhookId1',
        org_id: 'image1',
        kind: 'image',
        trigger: 'image',
        field: 'name',
        filter: '(quay.io\\/mynamespace)',
        service_url: 'https://somewhere.else/check'
      });
      let deleteWebhook = v2.__get__('deleteWebhook');
      var request = httpMocks.createRequest({
        method: 'DELETE', params: {
          webhook_id: 'webhookRoutesWebhookId1'
        },
        url: '/',
        org: {
          _id: 1
        },
        log: log,
        db: db
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await deleteWebhook(request, response, next);
      assert.equal(response.statusCode, 204);
    });
  });
});
