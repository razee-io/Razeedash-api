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

  describe('addUpdateCluster', () => {
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
      await db.collection('clusters').insertOne({ org_id: 1, cluster_id: 'testUpdateOne205', dirty: 1  });
      var request = httpMocks.createRequest({
        method: 'POST',
        url: '/testUpdateOne205', params: {
          cluster_id: 'testUpdateOne205'
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
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await addUpdateCluster(request, response, next);

      assert.equal(response.statusCode, 205);
      assert.equal(response._getData(), 'Please resync');

    });
  });

  describe('updateClusterResources', () => {
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

    it('should return 200', async () => {
      // Setup
      let updateClusterResources = v2.__get__('updateClusterResources');
      var request = httpMocks.createRequest({
        method: 'POST',
        url: 'testupdateClusterResources400/resources', params: {
          cluster_id: 'testupdateClusterResources400'
        },
        org: {
          _id: 1
        },db: db
      });
      request._setBody({
        type: 'ADDED',
        selfLink: '/apis/apps/v1/namespaces/razee/deployments/watch-keeper',
        data: '{"kind":"Deployment","apiVersion":"apps/v1","metadata":{"name":"watch-keeper","namespace":"razee","selfLink":"/apis/apps/v1/namespaces/razee/deployments/watch-keeper","uid":"672ff712-7c9f-11e9-b757-ce243beadde5","resourceVersion":"131921","generation":1,"creationTimestamp":"2019-05-22T14:39:28Z","labels":{"razee/watch-resource":"detail"},"annotations":{"deployment.kubernetes.io/revision":"1","razee.io/commit-sha":"ec8ca9edcb1c24f137773a8fb681a1d327ebe770","razee.io/git-repo":"https://github.com/razee-io/Watch-keeper.git","version":"ec8ca9edcb1c24f137773a8fb681a1d327ebe770"}},"spec":{"replicas":1,"selector":{"matchLabels":{"app":"watch-keeper"}},"template":{"metadata":{"name":"watch-keeper","creationTimestamp":null,"labels":{"app":"watch-keeper"}},"spec":{"containers":[{"name":"watch-keeper","image":"quay.io/razee/watch-keeper:0.0.3","env":[{"name":"START_DELAY_MAX","valueFrom":{"configMapKeyRef":{"name":"watch-keeper-config","key":"START_DELAY_MAX","optional":true}}},{"name":"NAMESPACE","valueFrom":{"fieldRef":{"apiVersion":"v1","fieldPath":"metadata.namespace"}}},{"name":"RAZEEDASH_URL","valueFrom":{"configMapKeyRef":{"name":"watch-keeper-config","key":"RAZEEDASH_URL"}}},{"name":"RAZEEDASH_ORG_KEY","valueFrom":{"secretKeyRef":{"name":"watch-keeper-secret","key":"RAZEEDASH_ORG_KEY"}}},{"name":"NODE_ENV","value":"REDACTED"}],"resources":{"limits":{"cpu":"400m","memory":"500Mi"},"requests":{"cpu":"50m","memory":"100Mi"}},"livenessProbe":{"exec":{"command":["sh/liveness.sh"]},"initialDelaySeconds":600,"timeoutSeconds":30,"periodSeconds":300,"successThreshold":1,"failureThreshold":1},"terminationMessagePath":"/dev/termination-log","terminationMessagePolicy":"File","imagePullPolicy":"Always"}],"restartPolicy":"Always","terminationGracePeriodSeconds":30,"dnsPolicy":"ClusterFirst","serviceAccountName":"watch-keeper-sa","serviceAccount":"watch-keeper-sa","securityContext":{},"schedulerName":"default-scheduler"}},"strategy":{"type":"RollingUpdate","rollingUpdate":{"maxUnavailable":"25%","maxSurge":"25%"}},"revisionHistoryLimit":0,"progressDeadlineSeconds":600},"status":{"observedGeneration":1,"replicas":1,"updatedReplicas":1,"readyReplicas":1,"availableReplicas":1,"conditions":[{"type":"Available","status":"True","lastUpdateTime":"2019-05-22T14:39:32Z","lastTransitionTime":"2019-05-22T14:39:32Z","reason":"MinimumReplicasAvailable","message":"Deployment has minimum availability."},{"type":"Progressing","status":"True","lastUpdateTime":"2019-05-22T14:39:32Z","lastTransitionTime":"2019-05-22T14:39:28Z","reason":"NewReplicaSetAvailable","message":"ReplicaSet watch-keeper-6678dd4f6f has successfully progressed."}]}}',
        object: {'kind':'Deployment','apiVersion':'apps/v1','metadata':{'name':'watch-keeper','namespace':'razee','selfLink':'/apis/apps/v1/namespaces/razee/deployments/watch-keeper','uid':'672ff712-7c9f-11e9-b757-ce243beadde5','resourceVersion':'131921','generation':1,'creationTimestamp':'2019-05-22T14:39:28Z','labels':{'razee/watch-resource':'detail'},'annotations':{'deployment.kubernetes.io/revision':'1','razee.io/commit-sha':'ec8ca9edcb1c24f137773a8fb681a1d327ebe770','razee.io/git-repo':'https://github.com/razee-io/Watch-keeper.git','version':'ec8ca9edcb1c24f137773a8fb681a1d327ebe770'}},'spec':{'replicas':1,'selector':{'matchLabels':{'app':'watch-keeper'}},'template':{'metadata':{'name':'watch-keeper','creationTimestamp':null,'labels':{'app':'watch-keeper'}},'spec':{'containers':[{'name':'watch-keeper','image':'quay.io/razee/watch-keeper:0.0.3','env':[{'name':'START_DELAY_MAX','valueFrom':{'configMapKeyRef':{'name':'watch-keeper-config','key':'START_DELAY_MAX','optional':true}}},{'name':'NAMESPACE','valueFrom':{'fieldRef':{'apiVersion':'v1','fieldPath':'metadata.namespace'}}},{'name':'RAZEEDASH_URL','valueFrom':{'configMapKeyRef':{'name':'watch-keeper-config','key':'RAZEEDASH_URL'}}},{'name':'RAZEEDASH_ORG_KEY','valueFrom':{'secretKeyRef':{'name':'watch-keeper-secret','key':'RAZEEDASH_ORG_KEY'}}},{'name':'NODE_ENV','value':'REDACTED'}],'resources':{'limits':{'cpu':'400m','memory':'500Mi'},'requests':{'cpu':'50m','memory':'100Mi'}},'livenessProbe':{'exec':{'command':['sh/liveness.sh']},'initialDelaySeconds':600,'timeoutSeconds':30,'periodSeconds':300,'successThreshold':1,'failureThreshold':1},'terminationMessagePath':'/dev/termination-log','terminationMessagePolicy':'File','imagePullPolicy':'Always'}],'restartPolicy':'Always','terminationGracePeriodSeconds':30,'dnsPolicy':'ClusterFirst','serviceAccountName':'watch-keeper-sa','serviceAccount':'watch-keeper-sa','securityContext':{},'schedulerName':'default-scheduler'}},'strategy':{'type':'RollingUpdate','rollingUpdate':{'maxUnavailable':'25%','maxSurge':'25%'}},'revisionHistoryLimit':0,'progressDeadlineSeconds':600},'status':{'observedGeneration':1,'replicas':1,'updatedReplicas':1,'readyReplicas':1,'availableReplicas':1,'conditions':[{'type':'Available','status':'True','lastUpdateTime':'2019-05-22T14:39:32Z','lastTransitionTime':'2019-05-22T14:39:32Z','reason':'MinimumReplicasAvailable','message':'Deployment has minimum availability.'},{'type':'Progressing','status':'True','lastUpdateTime':'2019-05-22T14:39:32Z','lastTransitionTime':'2019-05-22T14:39:28Z','reason':'NewReplicaSetAvailable','message':'ReplicaSet watch-keeper-6678dd4f6f has successfully progressed.'}]}},
      });

      var response = httpMocks.createResponse();
      // Test
      let next = (err) => {
        assert.equal(err.message, null);
      };

      await updateClusterResources(request, response, next);

      assert.equal(response.statusCode, 200);
      assert.equal(response._getData(), 'Thanks');
    });
  });
});
