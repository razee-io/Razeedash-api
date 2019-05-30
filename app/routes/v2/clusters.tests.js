/* eslint-env node, mocha */
const assert = require('assert');
const mongodb = require('mongo-mock');
var httpMocks = require('node-mocks-http');
const rewire = require('rewire');
let v2 = rewire('./clusters');

let db = {};

describe('clusters', () => {

  before(function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    MongoClient.connect('someconnectstring', {}, function (err, database) {
      database.collection('clusters');
      database.collection('resourceStats');
      db = database;
    });
  });

  after(function () {
    db.close();
  });

  describe('POST /:cluster_id', () => {
    it('should return 200 if cluster does not exist and inserts into mongodb', async () => {
      // Setup
      let addUpdateCluster = v2.__get__('addUpdateCluster');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/testInsertOne200', params: {
          cluster_id: 'testInsertOne200'
        },
        org: {
          _id: 1
        },
        body: {
          kube_version: {
            major: '1',
            minor: '13',
            gitVersion: 'v1.13.6+IKS',
            gitCommit: 'ac5f7341d5d0ce8ea8f206ba5b030dc9e9d4cc97',
            gitTreeState: 'clean',
            buildDate: '2019-05-09T13:26:51Z',
            goVersion: 'go1.11.5',
            compiler: 'gc',
            platform: 'linux/amd64'
          }
        },
        db: db
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (error) => {
        assert.equal(error, null);
      };


      await addUpdateCluster(request, response, next);

      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Welcome to Razee');

    });
  });
  describe('POST /:cluster_id', () => {
    it('should return 200 if cluster does not exist and not dirty', async () => {
      // Setup
      let addUpdateCluster = v2.__get__('addUpdateCluster');
      await db.collection('clusters').insertOne({ org_id: 1, cluster_id: 'testUpdateOne200' });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/testUpdateOne200', params: {
          cluster_id: 'testUpdateOne200'
        },
        org: {
          _id: 1
        },
        body: {
          kube_version: {
            major: '1',
            minor: '13',
            gitVersion: 'v1.13.6+IKS',
            gitCommit: 'ac5f7341d5d0ce8ea8f206ba5b030dc9e9d4cc97',
            gitTreeState: 'clean',
            buildDate: '2019-05-09T13:26:51Z',
            goVersion: 'go1.11.5',
            compiler: 'gc',
            platform: 'linux/amd64'
          }
        },
        db: db
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (error) => {
        assert.equal(error, null);
      };


      await addUpdateCluster(request, response, next);

      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks for the update');

    });
  });
});
