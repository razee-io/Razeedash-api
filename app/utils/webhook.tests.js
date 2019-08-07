const nock = require('nock');
const chai = require('chai');
const mongodb = require('mongo-mock');
const log = require('../log').log;
const { triggerWebhooksForImage } = require('./webhook.js');
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
        org_id: 'webhooktestorgid',
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
        org_id: 'webhooktestorgid',
        kind: 'image',
        trigger: 'image',
        field: 'name',
        // eslint-disable-next-line no-useless-escape
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