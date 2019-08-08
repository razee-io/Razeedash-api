const nock = require('nock');
const chai = require('chai');
const mongodb = require('mongo-mock');
const log = require('../log').log;
const { WEBHOOOK_TRIGGER_CLUSTER, WEBHOOOK_TRIGGER_IMAGE, triggerWebhooksForCluster, triggerWebhooksForImage } = require('./webhook.js');
let req = {};

describe('webhook', () => {
  before((done) => {
    mongodb.max_delay = 0;
    var MongoClient = mongodb.MongoClient;
    MongoClient.connect('someconnstring', {}, (err, database) => {
      log.info(err);
      req.db = database;
      done();
    });
    req.log = log;
    req.org = { _id: 'webhooktestorgid' };
  });

  after(() => {
    req.db.close();
  });

  describe('triggerWebhooksForImage', () => {
    it('filter - success', async () => {
      // Setup
      const fakeServiceURL = 'https://myfakescanner.com';
      nock(fakeServiceURL)
        .post('/check')
        .reply(201);
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
      chai.assert.isTrue(result);
    });
    it('filter - failure', async () => {
      // Setup
      const fakeServiceURL = 'https://myfakescannererr.com';
      nock(fakeServiceURL)
        .post('/check')
        .reply(500);
      const Webhooks = req.db.collection('webhooks');
      await Webhooks.insert({
        _id: 2,
        org_id: req.org._id,
        trigger: WEBHOOOK_TRIGGER_IMAGE,
        field: 'name',
        filter: '(quay.io\\/othernamespace)',
        service_url: `${fakeServiceURL}/check`
      });
      const image = 'quay.io/othernamespace/razeedash-api:0.0.21';
      const image_id = 'sha256:e3d11b0e0d0ec5d7772d45c664f275b9778204b26bd2f5e0bf5543695234379d';
      // Test
      const result = await triggerWebhooksForImage(image_id, image, req);
      chai.assert.isFalse(result);
    });
  });
});

describe('triggerWebhooksForCluster', () => {
  it('no filter - success', async () => {
    // Setup
    const fakeServiceURL = 'https://myfakeinttest.com';
    nock(fakeServiceURL)
      .post('/runtest')
      .reply(201);
    const Webhooks = req.db.collection('webhooks');
    await Webhooks.insert({
      _id: 3,
      org_id: req.org._id,
      trigger: WEBHOOOK_TRIGGER_CLUSTER,
      kind: 'deployment',
      service_url: `${fakeServiceURL}/runtest`
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
    let c  = await Clusters.findOne({org_id: req.org._id, cluster_id: clusterId});
    req.log.info(c,'cluster');
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
    // Test
    const result = await triggerWebhooksForCluster(clusterId, resourceId, resourceObj, req);
    chai.assert.isTrue(result);
  });
});