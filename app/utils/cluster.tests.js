/* eslint-env node, mocha */
const assert = require('assert');
const mongodb = require('mongo-mock');
var httpMocks = require('node-mocks-http');
const log = require('../log').log;

let getCluster = require('./cluster').getCluster;
let cleanObjKeysMongo = require('./cluster').cleanObjKeysForMongo;

let db = {};

describe('utils', () => {
  describe('cleanObjKeysMongo', () => {
    it('Replace invalid characters with underscore for object keys', () => {
      let data = { '$fudge': { b: 'somegarbage', '*more*trash': 'somevalue' } };
      let cleanData = cleanObjKeysMongo(data);
      assert.equal(JSON.stringify(cleanData), JSON.stringify({ '_fudge': { b: 'somegarbage', '_more_trash': 'somevalue' } }));
    });
  });

  describe('getCluster', () => {

    before(function (done) {
      mongodb.max_delay = 0;
      const MongoClient = mongodb.MongoClient;
      MongoClient.connect('someconnectstring', {}, (err, database) => {
        database.collection('clusters', () => {
          database.collection('resources', () => {
            database.collection('resourceStats', () => {
              db = database;
              done();
            });
          });
        });
      });
    });

    after(function () {
      db.close();
    });

    it('should return 401 if missing org ID', async () => {
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

      await getCluster(request, response, next);

      assert.equal(nextCalled, false);

      assert.equal(response.statusCode, 401);
    });

    it('should return 401 if missing cluster ID', async () => {
      // Setup
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
        },
        org: {
          _id: 1
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

      await getCluster(request, response, next);

      assert.equal(nextCalled, false);

      assert.equal(response.statusCode, 401);
    });

    it('should return 403 if cannot find cluster', async () => {
      // Setup
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
          cluster_id: 'someclusterid'
        },
        org: {
          _id: 1
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

      await getCluster(request, response, next);

      assert.equal(nextCalled, false);

      assert.equal(response.statusCode, 403);
    });

    it('should call next', async () => {
      // Setup
      const Clusters = db.collection('clusters');
      await Clusters.insertOne({ cluster_id: 'someclusterid', org_id: 2, somedata: 'xyz' });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'someclusterid/resources',
        params: {
          cluster_id: 'someclusterid'
        },
        org: {
          _id: 2
        },
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

      await getCluster(request, response, next);

      assert.equal(request.cluster.somedata, 'xyz');
      assert.equal(nextCalled, true);
    });
  });
});
