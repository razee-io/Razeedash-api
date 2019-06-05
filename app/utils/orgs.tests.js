/* eslint-env node, mocha */
const assert = require('assert');
const mongodb = require('mongo-mock');
var httpMocks = require('node-mocks-http');
const log = require('../log').log;

let getOrg = require('./orgs').getOrg;

let db = {};

describe('utils', () => {

  describe('orgs', () => {

    before(function () {
      mongodb.max_delay = 0;
      const MongoClient = mongodb.MongoClient;
      MongoClient.connect('someconnectstring', {}, function (err, database) {
        database.collection('clusters');
        database.collection('resources');
        database.collection('resourceStats');
        db = database;
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
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
          cluster_id: 'someclusterid'
        },
        orgKey: 1,
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
      await Orgs.insertOne({ orgKeys: 2, somedata: 'xyz' });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
          cluster_id: 'someclusterid'
        },
        orgKey: 2,
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
