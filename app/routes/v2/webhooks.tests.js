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
const { WEBHOOK_TRIGGER_IMAGE, WEBHOOK_TRIGGER_CLUSTER } = require('../../utils/webhook');
let db = {};
let webhook1 = {};
let webhook2 = {};

describe('webhooks', () => {
  beforeEach((done) => {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    MongoClient.persist = false;
    MongoClient.connect('someconnectstring', {}, async (err, database) => {
      try {
        db = database;
        const Clusters = db.collection('clusters');
        const Webhooks = db.collection('webhooks');
        const Images = db.collection('images');
        await Webhooks.insertOne({
          org_id: 1,
          kind: 'image',
          trigger: WEBHOOK_TRIGGER_IMAGE,
          field: 'name',
          filter: '(quay.io\\/mynamespace)',
          service_url: 'https://somewhere.else/check'
        });        
        webhook1 = await Webhooks.findOne({'kind':'image'}); // work around for mongo-mock to get _id
        await Webhooks.insertOne({
          org_id: 1,
          kind: 'Deployment',
          trigger: WEBHOOK_TRIGGER_CLUSTER,
          cluster_id: 'myclusterid',
          service_url: 'https://integrationtest.elsewhere/run'
        });
        webhook2 = await Webhooks.findOne({'kind':'Deployment'});
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
        console.log('pants');
        console.log(err);
        done();
      }
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('addCallbackResult', () => {
    it('should throw db error', async () => {
      // Setup
      let addCallbackResult = v2.__get__('addCallbackResult');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/',
        org: {
          _id: 1
        },
        log: log,
        body: {
          webhook_id: 'mywebhookid',
          url: 'https://i.imgur.com/jR0LYTx.jpg',
          description: 'test passed',
          link: 'http://myfakeservice',
          status: 'info'
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

      await addCallbackResult(request, response, next);
      assert.equal(nextCalled, true);
    });
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
        collection: () => { throw new Error('oops'); }, // DB Error
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

    it('cluster trigger 201', async () => {
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
          kind: 'Deployment',
          trigger: WEBHOOK_TRIGGER_CLUSTER,
          cluster_id: 'myclusterid',
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

    it('image trigger 201', async () => {
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
          kind: 'Image',
          trigger: WEBHOOK_TRIGGER_IMAGE,
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
          webhook_id: webhook1._id
        },
        org: {
          _id: 1
        },
        log: log,
      });
      // eslint-disable-next-line require-atomic-updates
      request.db = {
        collection: () => { throw new Error('oops'); }, // DB Error
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
      assert.equal(nextCalled, true);
    });

    it('should return 201', async () => {
      // Setup

      let deleteWebhook = v2.__get__('deleteWebhook');
      var request = httpMocks.createRequest({
        method: 'DELETE', 
        params: {
          webhook_id: webhook2._id
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
