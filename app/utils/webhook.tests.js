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
const nock = require('nock');
const assert = require('assert');
const mongodb = require('mongo-mock');
const log = require('../log').log;
const { WEBHOOK_TRIGGER_CLUSTER, WEBHOOK_TRIGGER_IMAGE, insertClusterBadge, insertImageBadge, triggerWebhooksForCluster, triggerWebhooksForImage } = require('./webhook.js');
let req = {};

describe('webhook', () => {
  beforeEach((done) => {
    mongodb.max_delay = 0;
    var MongoClient = mongodb.MongoClient;
    MongoClient.connect('someconnstring', {}, (err, database) => {
      req.db = database;
      done();
    });
    req.log = log;
    req.org = { _id: 'webhooktestorgid' };
  });

  afterEach(() => {
    req.db.close();
  });

  describe('triggerWebhooksForImage', () => {
    it('filter - success', async () => {
      // Setup
      process.env.RAZEEDASH_API_URL = 'https://api.razee.mycompany.com';
      const fakeServiceURL = 'https://myfakescanner.com';
      let body = {};
      let nockCalled = false;
      nock(fakeServiceURL)
        .post('/check')
        .reply(201, (uri, requestBody) => {
          nockCalled = true;
          body = requestBody;
          return;
        });
      const Webhooks = req.db.collection('webhooks');
      await Webhooks.insert({
        _id: 1,
        org_id: req.org._id,
        kind: 'image',
        trigger: 'image',
        field: 'name',
        // eslint-disable-next-line no-useless-escape
        filter: '(quay.io\\/mynamespace)',
        service_url: `${fakeServiceURL}/check`
      });
      const image = 'quay.io/mynamespace/razeedash-api:0.0.21';
      const image_id = 'sha256:e3d11b0e0d0ec5d7772d45c664f275b9778204b26bd2f5e0bf5543695234379d';
      // Test
      const result = await triggerWebhooksForImage(image_id, image, req);
      assert.equal(result, true);
      assert.equal(nockCalled, true);
      assert.equal(body.callback_url, 'https://api.razee.mycompany.com/v2/callback');
    });
    it('filter - http 500 failure', async () => {
      // Setup
      process.env.RAZEEDASH_API_URL = 'https://localhost:8081';
      const fakeServiceURL = 'https://myfakescannererr.com';
      let body = {};
      let nockCalled = false;
      nock(fakeServiceURL)
        .post('/check')
        .reply(500, (uri, requestBody) => {
          nockCalled = true;
          body = requestBody;
          return;
        });
      const Webhooks = req.db.collection('webhooks');
      await Webhooks.insert({
        _id: 2,
        org_id: req.org._id,
        trigger: WEBHOOK_TRIGGER_IMAGE,
        field: 'name',
        filter: '(quay.io\\/othernamespace)',
        service_url: `${fakeServiceURL}/check`
      });
      const image = 'quay.io/othernamespace/razeedash-api:0.0.21';
      const image_id = 'sha256:e3d11b0e0d0ec5d7772d45c664f275b9778204b26bd2f5e0bf5543695234379d';
      // Test
      const result = await triggerWebhooksForImage(image_id, image, req);
      assert.equal(result, false);
      assert.equal(nockCalled, true);
      assert.equal(body.callback_url, 'https://localhost:8081/v2/callback');
    });

    it('filter - database failure', async () => {
      // Setup
      process.env.RAZEEDASH_API_URL = 'https://localhost:8081';
      const fakeServiceURL = 'https://dontcallme.com';
      let nockCalled = false;
      nock(fakeServiceURL)
        .post('/check')
        .reply(201, () => {
          nockCalled = true;
          return;
        });
      const Webhooks = req.db.collection('webhooks');
      await Webhooks.insert({
        _id: 3,
        org_id: req.org._id,
        trigger: WEBHOOK_TRIGGER_IMAGE,
        field: 'name',
        filter: '(quay.io\\/othernamespace)',
        service_url: `${fakeServiceURL}/check`
      });
      const image = 'quay.io/othernamespace/razeedash-api:0.0.21';
      const image_id = 'sha256:e3d11b0e0d0ec5d7772d45c664f275b9778204b26bd2f5e0bf5543695234379d';
      const goodDB = req.db;
      // eslint-disable-next-line require-atomic-updates
      req.db = {
        collection: () => { throw new Error('oops'); },
        close: () => { goodDB.close(); }
      };

      // Test
      const result = await triggerWebhooksForImage(image_id, image, req);
      assert.equal(result, false);
      assert.equal(nockCalled, false);
    });
  });

  describe('triggerWebhooksForCluster', () => {
    it('no filter - success', async () => {
      // Setup
      process.env.RAZEEDASH_API_URL = 'https://localhost:8081/';
      const fakeServiceURL = 'https://myfakeinttest.com';
      let body = {};
      let nockCalled = false;
      nock(fakeServiceURL)
        .post('/runtest')
        .reply(201, (uri, requestBody) => {
          nockCalled = true;
          body = requestBody;
          return;
        });

      const clusterId = '9c4315e4-7bf4-11e9-b757-ce243beadde5';
      const Clusters = req.db.collection('clusters');
      await Clusters.insert({
        _id: 1,
        org_id: req.org._id,
        cluster_id: clusterId,
        metadata: {
          name: 'staging'
        }
      });
      const resourceId = 'testResoureId';
      const resourceObj = {
        '_id': resourceId,
        'cluster_id': clusterId,
        'org_id': req.org._id,
        'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper',
        'deleted': false,
        'hash': 'd0c0e39b2ba2cbbaa5709da33e2a4d84ce5a7ae1',
        'searchableData': {
          'kind': 'Deployment',
          'name': 'watch-keeper',
          'namespace': 'razee',
          'apiVersion': 'apps/v1'
        },
      };
      const Webhooks = req.db.collection('webhooks');
      await Webhooks.insert({
        _id: 4,
        org_id: req.org._id,
        cluster_id: clusterId,
        trigger: WEBHOOK_TRIGGER_CLUSTER,
        kind: resourceObj.searchableData.kind,
        service_url: `${fakeServiceURL}/runtest`
      });
      // Test
      const result = await triggerWebhooksForCluster(clusterId, resourceObj, req);
      assert.equal(result, true);
      assert.equal(nockCalled, true);
      assert.equal(body.callback_url, 'https://localhost:8081/v2/callback');
    });
    it('no filter - db failure', async () => {
      // Setup
      process.env.RAZEEDASH_API_URL = 'https://localhost:8081/';
      const fakeServiceURL = 'https://shouldnotcall.com';
      let nockCalled = false;
      nock(fakeServiceURL)
        .post('/runtest')
        .reply(201, () => {
          nockCalled = true;
          return;
        });

      const clusterId = '9c4315e4-7bf4-11e9-b757-ce243beadde5';
      const Clusters = req.db.collection('clusters');
      await Clusters.insert({
        _id: 2,
        org_id: req.org._id,
        cluster_id: clusterId,
        metadata: {
          name: 'staging'
        }
      });
      const resourceId = 'testResoureId';
      const resourceObj = {
        '_id': resourceId,
        'cluster_id': clusterId,
        'org_id': req.org._id,
        'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper',
        'deleted': false,
        'hash': 'd0c0e39b2ba2cbbaa5709da33e2a4d84ce5a7ae1',
        'searchableData': {
          'kind': 'Deployment',
          'name': 'watch-keeper',
          'namespace': 'razee',
          'apiVersion': 'apps/v1'
        },
      };
      const Webhooks = req.db.collection('webhooks');
      await Webhooks.insert({
        _id: 5,
        org_id: req.org._id,
        cluster_id: clusterId,
        trigger: WEBHOOK_TRIGGER_CLUSTER,
        kind: resourceObj.searchableData.kind,
        service_url: `${fakeServiceURL}/runtest`
      }); const goodDB = req.db;
      // eslint-disable-next-line require-atomic-updates
      req.db = {
        collection: () => { throw new Error('oops'); },
        close: () => { goodDB.close(); }
      };

      // Test
      const result = await triggerWebhooksForCluster(clusterId, resourceObj, req);
      assert.equal(result, false);
      assert.equal(nockCalled, false);
    });
  });

  describe('insert badges', () => {
    it('insertClusterBadge - no existing badges', async () => {
      // Setup
      const clusterId = 'addbadge';
      const Clusters = req.db.collection('clusters');
      await Clusters.insert({
        org_id: req.org._id,
        cluster_id: clusterId,
        metadata: {
          name: 'staging'
        }
      });
      const badge = {
        webhook_id: 5,
        url: 'https://i.imgur.com/jR0LYTx.jpg',
        description: 'test passed',
        link: 'http://myfakeservice',
        status: 'info'
      };
      let webhook = {
        org_id: req.org._id,
        cluster_id: clusterId,
        trigger: WEBHOOK_TRIGGER_CLUSTER,
        kind: 'Deployment',
        service_url: 'https://fake.call'
      };
      // Test
      const result = await insertClusterBadge(webhook, badge, req);
      assert.equal(typeof result.badges, 'object');
      assert.equal(result.badges.length, 1);
      assert.equal(result.badges[0].description, 'test passed');
    });

    it('insertClusterBadge - replace existing badge', async () => {
      // Setup
      const clusterId = 'addexistingbadge';
      const test_webhook_id = 10;
      const Clusters = req.db.collection('clusters');
      await Clusters.insert({
        org_id: req.org._id,
        cluster_id: clusterId,
        metadata: {
          name: 'staging'
        },
        badges: [{
          webhook_id: test_webhook_id,
          url: 'https://i.imgur.com/jR0LYTx.jpg',
          description: 'test passed',
          link: 'http://myfakeservice',
          status: 'info'
        }, {
          webhook_id: 'anotheridxyc',
          url: 'https://i.imgur.com/jR0LYTx.jpg',
          description: 'test passed',
          link: 'http://myfakeservice',
          status: 'info'
        }]
      });
      const badge = {
        webhook_id: test_webhook_id,
        url: 'https://i.imgur.com/jR0LYTx.jpg',
        description: 'test failed',
        link: 'http://myfakeservice',
        status: 'error'
      };
      let webhook = {
        org_id: req.org._id,
        cluster_id: clusterId,
        trigger: WEBHOOK_TRIGGER_CLUSTER,
        kind: 'Deployment',
        service_url: 'https://fake.call'
      };
      // Test
      const result = await insertClusterBadge(webhook, badge, req);
      req.log.info(result);
      assert.equal(typeof result.badges, 'object');
      assert.equal(result.badges.length, 2);
      const testBadge = (badge) => {
        if (badge.webhook_id == test_webhook_id) {
          assert.equal(badge.status, 'error');
          assert.equal(badge.description, 'test failed');
        } else {
          assert.equal(badge.status, 'info');
          assert.equal(badge.description, 'test passed');
        }
      };
      testBadge(result.badges[0]);
      testBadge(result.badges[1]);
    });


    it('insertImageBadge - no existing badges', async () => {
      // Setup
      const image_id = 'insertbadge';
      const Images = req.db.collection('images');
      await Images.insert({
        org_id: req.org._id,
        image_id: image_id,
        metadata: {
          name: 'staging'
        }
      });
      const badge = {
        webhook_id: 5,
        image_id: image_id,
        url: 'https://i.imgur.com/jR0LYTx.jpg',
        description: 'test passed',
        link: 'http://myfakeservice',
        status: 'info'
      };
      // Test
      const result = await insertImageBadge(badge, req);
      assert.equal(typeof result.badges, 'object');
      assert.equal(result.badges.length, 1);
      assert.equal(result.badges[0].description, 'test passed');
    });

    it('insertImageBadge - replace existing badge', async () => {
      // Setup
      const image_id = 'addexistingimagebadge';
      const test_webhook_id = 20;
      const Images = req.db.collection('images');
      await Images.insert({
        org_id: req.org._id,
        image_id: image_id,
        metadata: {
          name: 'staging'
        },
        badges: [{
          webhook_id: test_webhook_id,
          url: 'https://i.imgur.com/jR0LYTx.jpg',
          description: 'test passed',
          link: 'http://myfakeservice',
          status: 'info'
        }, {
          webhook_id: 'someotherid',
          url: 'https://i.imgur.com/jR0LYTx.jpg',
          description: 'test passed',
          link: 'http://myfakeservice',
          status: 'info'
        }]
      });
      const badge = {
        webhook_id: 20,
        image_id: image_id,
        url: 'https://i.imgur.com/jR0LYTx.jpg',
        description: 'test failed',
        link: 'http://myfakeservice',
        status: 'error'
      };
      // Test
      const result = await insertImageBadge(badge, req);
      req.log.info(result);
      assert.equal(typeof result.badges, 'object');
      assert.equal(result.badges.length, 2);
      const testBadge = (badge) => {
        if (badge.webhook_id == test_webhook_id) {
          assert.equal(badge.status, 'error');
          assert.equal(badge.description, 'test failed');
        } else {
          assert.equal(badge.status, 'info');
          assert.equal(badge.description, 'test passed');
        }
      };
      testBadge(result.badges[0]);
      testBadge(result.badges[1]);
    });
  });
});
