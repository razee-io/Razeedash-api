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
const objectHash = require('object-hash');
const log = require('../../log').log;
var moment = require('moment');

const rewire = require('rewire');
let v2 = rewire('./clusters');
let db = {};
const buildHashForResource = require('../../utils/cluster.js').buildHashForResource;

describe('clusters', () => {

  before(async function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    db = await MongoClient.connect('someconnectstring', {});
    db.collection('clusters');
    db.collection('resources');
    db.collection('resourceStats');
  });

  after(function () {
    db.close();
  });

  describe('addUpdateCluster', () => {
    it('should throw error', async () => {
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
        log: log,
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
        db: { collection: () => { throw new Error('oops'); } }
      });

      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, 'oops');
        nextCalled = true;
      };

      await addUpdateCluster(request, response, next);

      assert.equal(nextCalled, true);
    });

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
        log: log,
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
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addUpdateCluster(request, response, next);

      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Welcome to Razee');

    });

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
        log: log,
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
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addUpdateCluster(request, response, next);

      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks for the update');

    });

    it('should return 205 if cluster does not exist and is dirty', async () => {
      // Setup
      let addUpdateCluster = v2.__get__('addUpdateCluster');
      await db.collection('clusters').insertOne({ org_id: 1, cluster_id: 'testUpdateOne205', dirty: 1 });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/testUpdateOne205', params: {
          cluster_id: 'testUpdateOne205'
        },
        org: {
          _id: 1
        },
        log: log,
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
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addUpdateCluster(request, response, next);

      assert.equal(response.statusCode, 205);
      assert.equal(response._getData(), 'Please resync');

    });
  });

  describe('updateClusterResources', () => {
    it('should return 500 if unsupported event', async () => {
      // Setup
      const org_id = '1';
      const cluster_id = 'testupdateClusterResourcesAdd200';
      // missing selfLink
      const data = {
        'kind': 'Deployment', 'apiVersion': 'apps/v1',
        'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] }
      };
      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        db: db
      });
      request._setBody({
        type: 'FLIPPYCATS',
        data: JSON.stringify(data),
        object: data,
      });
      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, 'Unsupported event FLIPPYCATS');
        nextCalled = true;
      };

      await updateClusterResources(request, response, next);

      assert.equal(nextCalled, true);
    });

    it('should call next if missing resource malformed', async () => {
      // Setup
      const org_id = '1';
      const cluster_id = 'testupdateClusterResourcesAdd200';
      // missing selfLink
      const data = {
        'kind': 'Deployment', 'apiVersion': 'apps/v1',
        'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] }
      };
      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        db: db
      });
      request._setBody({
        type: 'ADDED',
        data: JSON.stringify(data),
        object: data,
      });
      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, 'Cannot read property \'selfLink\' of undefined');
        nextCalled = true;
      };

      await updateClusterResources(request, response, next);

      assert.equal(nextCalled, true);
    });

    it('should return 400 if missing resource body', async () => {
      // Setup
      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'testupdateClusterResources400/resources', params: {
          cluster_id: 'testupdateClusterResources400'
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
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);

      assert.equal(response.statusCode, 400);
      assert.equal(response._getData(), 'Missing resource body');
    });

    it('ADDED should return 200 and use s3', async () => {
      // Setup
      let createBucketAndObject = false;
      let mockS3client = {
        // eslint-disable-next-line no-unused-vars
        createBucketAndObject: async (bucket, key, data) => {
          // eslint-disable-next-line no-unused-vars
          return new Promise((resolve, reject) => {
            createBucketAndObject = true;
            resolve('createBucketAndObject');
          });
        }
      };
      const org_id = '1';
      const cluster_id = 'testupdateClusterResourcesAdd200';
      const data = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper';
      const hash = buildHashForResource(data, {});
      const key = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink };
      const Resources = db.collection('resources');

      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        s3: mockS3client,
        db: db
      });

      request._setBody({
        type: 'ADDED',
        selfLink: selfLink,
        data: JSON.stringify(data),
        object: data,
      });
      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);
      const resource = await Resources.findOne(key);
      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
      assert.equal(resource.deleted, false);
      assert.equal(resource.hash, hash);

      assert.equal(createBucketAndObject, true);
    });


    it('ADDED should return 200 and not use s3', async () => {
      // Setup
      let createBucketAndObject = false;
      const org_id = '1';
      const cluster_id = 'testupdateClusterResourcesAdd200';
      const data = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper';
      const hash = buildHashForResource(data, {});
      const key = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink };
      const Resources = db.collection('resources');

      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        s3: null,
        db: db
      });

      request._setBody({
        type: 'ADDED',
        selfLink: selfLink,
        data: JSON.stringify(data),
        object: data,
      });
      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);
      const resource = await Resources.findOne(key);
      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
      assert.equal(resource.deleted, false);
      assert.equal(resource.hash, hash);
      assert.equal(createBucketAndObject, false);
    });


    it('POLLED should return 200', async () => {
      // Setup
      const org_id = '3';
      const cluster_id = 'testupdateClusterResourcesAdd200';
      const data = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper';
      const hash = buildHashForResource(data, {});
      const key = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink };
      const Resources = db.collection('resources');

      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        db: db
      });

      request._setBody({
        type: 'POLLED',
        selfLink: selfLink,
        data: JSON.stringify(data),
        object: data,
      });
      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);
      const resource = await Resources.findOne(key);
      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
      assert.equal(resource.deleted, false);
      assert.equal(resource.hash, hash);
    });

    it('MODIFIED same record should return 200', async () => {
      // Setup
      const org_id = '2';
      const cluster_id = 'testupdateClusterResourcesMod200';
      const data = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper';
      const hash = buildHashForResource(data, {});
      const key = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink };
      const Resources = db.collection('resources');
      await Resources.insertOne(
        {
          org_id: org_id,
          cluster_id: cluster_id,
          selfLink: selfLink,
          deleted: true,
          hash: hash,
          data: JSON.stringify(data),
          $currentData: { created: true, updated: true }
        }
      );
      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        db: db
      });
      request._setBody({
        type: 'MODIFIED',
        selfLink: selfLink,
        data: JSON.stringify(data),
        object: data,
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);
      const resource = await Resources.findOne(key);
      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
      assert.equal(resource.deleted, false); // we set the field to be true for the the test
      assert.equal(resource.hash, hash);
    });

    it('MODIFIED different record should return 200', async () => {
      // Setup
      const org_id = '2';
      const cluster_id = 'testupdateClusterResourcesMod200Delta';
      const data = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper';
      const hash = buildHashForResource(data, {});
      const key = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink };
      const Resources = db.collection('resources');
      await Resources.insertOne(
        {
          org_id: org_id,
          cluster_id: cluster_id,
          selfLink: selfLink,
          deleted: true,
          hash: hash,
          data: JSON.stringify(data),
          $currentData: { created: true, updated: true }
        }
      );
      data.resourceVersion = '999999'; //change metadata field
      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        db: db
      });
      request._setBody({
        type: 'MODIFIED',
        selfLink: selfLink,
        data: JSON.stringify(data),
        object: data,
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);
      const resource = await Resources.findOne(key);
      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
      assert.equal(resource.deleted, false); // we set the field to be true for the the test
      assert.equal(resource.hash, buildHashForResource(data, {})); // hash of the data we POSTED
      assert.equal(resource.data, JSON.stringify(data)); // data we POSTED
    });

    it('DELETED should return 200 and use S3', async () => {
      // Setup
      let createBucketAndObject = false;
      let mockS3client = {
        // eslint-disable-next-line no-unused-vars
        createBucketAndObject: async (bucket, key, data) => {
          // eslint-disable-next-line no-unused-vars
          return new Promise((resolve, reject) => {
            createBucketAndObject = true;
            resolve('createBucketAndObject');
          });
        }
      };
      const org_id = '2';
      const cluster_id = 'testupdateClusterResourcesDelete200';
      const data = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper';
      const hash = buildHashForResource(data, {});
      const key = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink };
      const Resources = db.collection('resources');
      await Resources.insertOne(
        {
          org_id: org_id,
          cluster_id: cluster_id,
          selfLink: selfLink,
          deleted: false,
          hash: hash,
          data: JSON.stringify(data),
          $currentData: { created: true, updated: true }
        }
      );
      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        s3: mockS3client,
        db: db
      });
      request._setBody({
        type: 'DELETED',
        selfLink: selfLink,
        data: JSON.stringify(data),
        object: data,
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);
      const resource = await Resources.findOne(key);
      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
      assert.equal(resource.deleted, true);
      assert.equal(createBucketAndObject, true);
    });

    it('SYNC should return 200', async () => {
      // Setup
      const Resources = db.collection('resources');
      const org_id = '2';
      const cluster_id = 'testSync200';
      const data_a = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper1', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink_a = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper1';
      const hash_a = buildHashForResource(data_a, {});
      const key_a = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink_a };
      await Resources.insertOne(
        {
          org_id: org_id,
          cluster_id: cluster_id,
          selfLink: selfLink_a,
          deleted: false,
          hash: hash_a,
          data: JSON.stringify(data_a),
          $currentData: { created: true, },
          updated: new moment().toDate()
        }
      );
      const data_b = { 'kind': 'Deployment', 'apiVersion': 'apps/v1', 'metadata': { 'name': 'watch-keeper', 'namespace': 'razee', 'selfLink': '/apis/apps/v1/namespaces/razee/deployments/watch-keeper2', 'uid': '672ff712-7c9f-11e9-b757-ce243beadde5', 'resourceVersion': '131921', 'generation': 1, 'creationTimestamp': '2019-05-22T14:39:28Z', 'labels': { 'razee/watch-resource': 'detail' }, 'annotations': { 'deployment.kubernetes.io/revision': '1', 'razee.io/commit-sha': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770', 'razee.io/git-repo': 'https://github.com/razee-io/Watch-keeper.git', 'version': 'ec8ca9edcb1c24f137773a8fb681a1d327ebe770' } }, 'spec': { 'replicas': 1, 'selector': { 'matchLabels': { 'app': 'watch-keeper' } }, 'template': { 'metadata': { 'name': 'watch-keeper', 'creationTimestamp': null, 'labels': { 'app': 'watch-keeper' } }, 'spec': { 'containers': [{ 'name': 'watch-keeper', 'image': 'quay.io/razee/watch-keeper:0.0.3', 'env': [{ 'name': 'START_DELAY_MAX', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'START_DELAY_MAX', 'optional': true } } }, { 'name': 'NAMESPACE', 'valueFrom': { 'fieldRef': { 'apiVersion': 'v1', 'fieldPath': 'metadata.namespace' } } }, { 'name': 'RAZEEDASH_URL', 'valueFrom': { 'configMapKeyRef': { 'name': 'watch-keeper-config', 'key': 'RAZEEDASH_URL' } } }, { 'name': 'RAZEEDASH_ORG_KEY', 'valueFrom': { 'secretKeyRef': { 'name': 'watch-keeper-secret', 'key': 'RAZEEDASH_ORG_KEY' } } }, { 'name': 'NODE_ENV', 'value': 'REDACTED' }], 'resources': { 'limits': { 'cpu': '400m', 'memory': '500Mi' }, 'requests': { 'cpu': '50m', 'memory': '100Mi' } }, 'livenessProbe': { 'exec': { 'command': ['sh/liveness.sh'] }, 'initialDelaySeconds': 600, 'timeoutSeconds': 30, 'periodSeconds': 300, 'successThreshold': 1, 'failureThreshold': 1 }, 'terminationMessagePath': '/dev/termination-log', 'terminationMessagePolicy': 'File', 'imagePullPolicy': 'Always' }], 'restartPolicy': 'Always', 'terminationGracePeriodSeconds': 30, 'dnsPolicy': 'ClusterFirst', 'serviceAccountName': 'watch-keeper-sa', 'serviceAccount': 'watch-keeper-sa', 'securityContext': {}, 'schedulerName': 'default-scheduler' } }, 'strategy': { 'type': 'RollingUpdate', 'rollingUpdate': { 'maxUnavailable': '25%', 'maxSurge': '25%' } }, 'revisionHistoryLimit': 0, 'progressDeadlineSeconds': 600 }, 'status': { 'observedGeneration': 1, 'replicas': 1, 'updatedReplicas': 1, 'readyReplicas': 1, 'availableReplicas': 1, 'conditions': [{ 'type': 'Available', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:32Z', 'reason': 'MinimumReplicasAvailable', 'message': 'Deployment has minimum availability.' }, { 'type': 'Progressing', 'status': 'True', 'lastUpdateTime': '2019-05-22T14:39:32Z', 'lastTransitionTime': '2019-05-22T14:39:28Z', 'reason': 'NewReplicaSetAvailable', 'message': 'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.' }] } };
      const selfLink_b = '/apis/apps/v1/namespaces/razee/deployments/watch-keeper2';
      const hash_b = buildHashForResource(data_b, {});
      const key_b = { org_id: org_id, cluster_id: cluster_id, selfLink: selfLink_b };

      await Resources.insertOne(
        {
          org_id: org_id,
          cluster_id: cluster_id,
          selfLink: selfLink_b,
          deleted: false,
          hash: hash_b,
          data: JSON.stringify(data_b),
          $currentData: { created: true, },
          updated: new moment().subtract(2, 'days').toDate()
        }
      );
      let syncClusterResources = v2.__get__('syncClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/resources/sync`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        db: db
      });
      request._setBody({
        type: 'SYNC',
        object: [selfLink_a],
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await syncClusterResources(request, response, next);
      const resource_a = await Resources.findOne(key_a);
      assert.equal(resource_a.deleted, false);
      const resource_b = await Resources.findOne(key_b);
      assert.equal(resource_b.deleted, true);
      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
    });
  });
  describe('addClusterMessages', () => {
    it('should return 400 if missing body', async () => {
      // Setup
      let addClusterMessages = v2.__get__('addClusterMessages');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'testAddClusterMessages400/messages', params: {
          cluster_id: 'testAddClusterMessages400'
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
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addClusterMessages(request, response, next);

      assert.equal(response.statusCode, 400);
      assert.equal(response._getData(), 'Missing message body');
    });

    it('should call next if malformed body', async () => {
      // Setup
      let addClusterMessages = v2.__get__('addClusterMessages');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'testAddClusterMessages500/messages', params: {
          cluster_id: 'testAddClusterMessages500'
        },
        org: {
          _id: 1
        },
        log: log,
        db: db
      });
      request._setBody({});

      var response = httpMocks.createResponse();
      // Test
      let nextCalled = false;
      let next = (err) => {
        assert.equal(err.message, 'Object argument required.');
        nextCalled = true;
      };

      await addClusterMessages(request, response, next);

      assert.equal(nextCalled, true);
    });

    it('should return 200', async () => {
      // Setup
      const org_id = '1';
      const cluster_id = 'test';
      const Messages = db.collection('messages');

      let addClusterMessages = v2.__get__('addClusterMessages');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: `${cluster_id}/messages`, params: {
          cluster_id: cluster_id
        },
        org: {
          _id: org_id
        },
        log: log,
        db: db
      });

      request._setBody({
        level: 'ERROR',
        data: {},
        message: 'Zeke has typhoid',
      });
      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addClusterMessages(request, response, next);
      assert.equal(response.statusCode, 200);
      const message = await Messages.findOne({ cluster_id: cluster_id, org_id: org_id, level: 'ERROR', message_hash: objectHash('Zeke has typhoid') });
      assert.equal(message.message, 'Zeke has typhoid');
    });
  });
  describe('deleteCluster', () => {
    it('should call next() if the cluster was deleted', async () => {
      const cluster_id = 'testDeleteCluster';
      const org_id = '1';

      const Clusters = db.collection('clusters');
      await Clusters.insertOne( { org_id: org_id, cluster_id: cluster_id });

      const request = httpMocks.createRequest({
        method: 'DELETE',
        url: '/',
        params: { cluster_id: cluster_id },
        org: { _id: org_id },
        headers: { 'org-admin-key': 'goodKey123' },
        log: log,
        db: db
      });
      const response = httpMocks.createResponse();

      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const deleteCluster = v2.__get__('deleteCluster');
      await deleteCluster(request, response, next);
      assert.equal(nextCalled, true);
    });
    it('should return 500 if req.org._id is missing', async () => {
      const cluster_id = 'testDeleteCluster';

      const request = httpMocks.createRequest({
        method: 'DELETE',
        url: '/',
        params: { cluster_id: cluster_id },
        org: { },
        headers: { 'org-admin-key': 'goodKey123' },
        log: log,
        db: db
      });
      const response = httpMocks.createResponse();

      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const deleteCluster = v2.__get__('deleteCluster');
      await deleteCluster(request, response, next);

      assert.equal(nextCalled, false);
      assert.equal(response.statusCode, 500);
    });
    it('should return 500 if cluster id is not passed as a parameter', async () => {

      const request = httpMocks.createRequest({
        method: 'DELETE',
        url: '/',
        org: { _id: '1' },
        headers: { 'org-admin-key': 'goodKey123' },
        log: log,
        db: db
      });

      const response = httpMocks.createResponse();

      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const deleteCluster = v2.__get__('deleteCluster');
      await deleteCluster(request, response, next);

      assert.equal(nextCalled, false);
      assert.equal(response.statusCode, 500);
    });

  });
  describe('getClusters', () => {
    it('should call next() on a thrown error', async () => {

      const request = httpMocks.createRequest({ method: 'GET', url: '/', log: log });
      const response = httpMocks.createResponse();

      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const getClusters = v2.__get__('getClusters');
      await getClusters(request, response, next);

      assert.equal(nextCalled, true);
    });

    it('should return status 200', async () => {

      const cluster_id = 'testCluster';
      const org_id = '1';

      const Clusters = db.collection('clusters');
      await Clusters.insertOne( { org_id: org_id, cluster_id: cluster_id });

      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/',
        org: { _id: org_id },
        headers: { 'org-admin-key': 'goodKey123' },
        log: log,
        db: db
      });
      const response = httpMocks.createResponse();

      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const getClusters = v2.__get__('getClusters');
      await getClusters(request, response, next);

      assert.equal(nextCalled, false);
      assert.equal(response.statusCode, 200);

    });

  });
  describe('clusterDetails', () => {

    it('should return status 200', async () => {

      const cluster_id = 'testCluster';
      const org_id = '1';

      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/',
        org: { _id: org_id },
        headers: { 'org-admin-key': 'goodKey123' },
        cluster: cluster_id,
        log: log,
        db: db
      });
      const response = httpMocks.createResponse();

      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const clusterDetails = v2.__get__('clusterDetails');
      await clusterDetails(request, response, next);

      assert.equal(response.statusCode, 200);
      assert.equal(nextCalled, false);

    });
    it('should return status 404 for a missing cluster', async () => {

      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/',
        log: log,
        db: db
      });
      const response = httpMocks.createResponse();

      let nextCalled = false;
      const next = () => { nextCalled = true; };

      const clusterDetails = v2.__get__('clusterDetails');
      await clusterDetails(request, response, next);

      assert.equal(response.statusCode, 404);
      assert.equal(nextCalled, false);

    });

  });
});
