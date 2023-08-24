/**
 * Copyright 2023 IBM Corp. All Rights Reserved.
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

/*
* Fine-Grained-Authorization (FGA) allows the auth model to determine access to resources based on the name or id of the resource, and on the action being taken (e.g. read vs edit).
* This test suite provides validation of FGA behavior for auth models that support it by verifying that users with different FGA permissions are correctly allowed or restricted.
* Other test suites will validate behavior based on having admin permissions (or lack thereof) independently.
*/

const { expect } = require('chai');
const fs = require('fs');
const { v4: UUID } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { models } = require('../models');
const authFunc = require('./api');
const subscriptionFunc = require('./subscriptionsApi');
const groupFunc = require('./groupApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
// If the current auth model does not support FGA, skip FGA unit tests without error.
if (AUTH_MODEL === 'extauthtest' || AUTH_MODEL === 'passport.local') {
  console.log(`Found non fine-grained auth model: ${AUTH_MODEL}. Skipping fine-grained auth tests.`);
  return process.exit(0);
}
const externalAuth = require('../../externalAuth.js');
const testHelperPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testPath : `./testHelper.${AUTH_MODEL}`;
const { prepareUser, prepareOrganization, signInUser } = require(testHelperPath);
const testDataPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testDataPath : `./app/apollo/test/data/${AUTH_MODEL}`;

const rbacSync = require('../utils/rbacSync.js');
const { GraphqlPubSub } = require('../subscription');

let mongoServer;
let myApollo;

const graphqlPort = 18006;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const authApi = authFunc(graphqlUrl);
const subscriptionApi = subscriptionFunc(graphqlUrl);
const groupApi = groupFunc(graphqlUrl);

let fgaToken01, fgaToken02;
let fgaUser01Data, fgaUser02Data;
let org01Data, org01;
let testGroup1, testGroup2;
let testChannel1, testChannel2;
let testCluster1;
let testSubscription1, testSubscription2;
let testVersion1, testVersion2;

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
};

const createUsers = async () => {
  fgaUser01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/fga.spec.user01.json`,
      'utf8',
    ),
  );
  await prepareUser(models, fgaUser01Data);
  fgaUser02Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/fga.spec.user02.json`,
      'utf8',
    ),
  );
  await prepareUser(models, fgaUser02Data);
  return {};
};

const createChannels = async () => {
  testChannel1 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-channel1-uuid',
    name: 'test-channel1-name',
    versions: [],  /* channel versions is deprecated and no longer used */
  };
  await models.Channel.create(testChannel1);
  testChannel2 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-channel2-uuid',
    name: 'test-channel2-name',
    versions: [],  /* channel versions is deprecated and no longer used */
  };
  await models.Channel.create(testChannel2);
};

const createVersions = async () => {
  testVersion1 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-version1-uuid',
    name: 'test-version1-name',
    channel_id: testChannel1.uuid,
    channel_name: testChannel1.name,
    content: {
      metadata: {
        type: 'remote'
      },
      remote: {
        parameters: [{
          key: 'key1',
          value: 'val1',
        }]
      }
    }
  };
  await models.DeployableVersion.create(testVersion1);
  testVersion2 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-version2-uuid',
    name: 'test-version2-name',
    channel_id: testChannel2.uuid,
    channel_name: testChannel2.name,
    content: {
      metadata: {
        type: 'remote'
      },
      remote: {
        parameters: [{
          key: 'key1',
          value: 'val1',
        }]
      }
    }
  };
  await models.DeployableVersion.create(testVersion2);
};

const createGroups = async () => {
  testGroup1 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-group1-uuid',
    name: 'test-group1-name',
    owner: 'undefined'
  };
  await models.Group.create(testGroup1);
  testGroup2 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-group2-uuid',
    name: 'test-group2-name',
    owner: 'undefined'
  };
  await models.Group.create(testGroup2);
};

const createSubscriptions = async () => {
  testSubscription1 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-subscription1-uuid',
    name: 'test-subscription1-name',
    owner: 'undefined',
    groups: [testGroup1.name],
    channel_uuid: testChannel1.uuid,
    channel: testChannel1.name,
    version: testVersion1.name,
    version_uuid: testVersion1.uuid,
  };
  await models.Subscription.create(testSubscription1);
  testSubscription2 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-subscription2-uuid',
    name: 'test-subscription2-name',
    owner: 'undefined',
    groups: [testGroup2.name],
    channel_uuid: testChannel2.uuid,
    channel: testChannel2.name,
    version: testVersion2.name,
    version_uuid: testVersion2.uuid,
    tags: ['test-tag']
  };
  await models.Subscription.create(testSubscription2);
};

const createClusters = async () => {
  testCluster1 = {
    org_id: org01._id,
    cluster_id: 'test-cluster1-uuid',
    metadata: {
      kube_version: {
        major: '1',
        minor: '16',
        gitVersion: '1.99',
        gitCommit: 'abc',
        gitTreeState: 'def',
        buildDate: 'a_date',
        goVersion: '1.88',
        compiler: 'some compiler',
        platform: 'linux/amd64',
      },
    },
    registration: { name: 'test-cluster1-name' },
  };
  await models.Cluster.create(testCluster1);
};

const assignClusterGroups = async ( token, orgId, groupUUIDs, clusterUUID ) => {
  const methodName = 'assignClusterGroups (subscriptions test)';
  console.log( `${methodName} entry` );
  const {
    data: {
      data: { assignClusterGroups },
    },
  } = await groupApi.assignClusterGroups(token, {
    orgId: orgId,
    groupUuids: groupUUIDs,
    clusterIds: [clusterUUID]
  });
  expect(assignClusterGroups.modified).to.equal( groupUUIDs.length );
  await( sleep(1000) ); // Wait to give async RBAC Sync time to complete
  console.log( `${methodName} exit` );
};

const sleep = async ( ms ) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

describe('subscription graphql test suite', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    rbacSync.testMode(true); // Must be set to trigger/test RBAC Sync

    mongoServer = new MongoMemoryServer( { binary: { version: '4.2.17' } } );
    await mongoServer.start();
    const mongoUrl = mongoServer.getUri();
    console.log(`subscriptions.spec.js in memory test mongodb url is ${mongoUrl}`);

    myApollo = await apollo({
      mongo_url: mongoUrl,
      graphql_port: graphqlPort,
    });

    await createOrganizations();
    await createUsers();
    await createGroups();
    await createChannels();
    await createVersions();
    await createSubscriptions();
    await createClusters();

    fgaToken01 = await signInUser(models, authApi, fgaUser01Data);
    fgaToken02 = await signInUser(models, authApi, fgaUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    GraphqlPubSub.deleteInstance();
    await mongoServer.stop();
  }); // after

  // subscriptions for fgaUser01
  it('fgaUser01 has authorization to get ALLOWED subscription 1', async () => {
    let response;
    try {
      response = await subscriptionApi.subscriptions(fgaToken01, {
        orgId: org01._id,
      });
      const subscriptions = response.data.data.subscriptions;
      expect(subscriptions).to.have.length(1);
      expect(subscriptions[0].name).to.equal(testSubscription1.name);
      expect(subscriptions[0].identitySyncStatus, 'subscription did not include identitySyncStatus').to.exist;
      expect(subscriptions[0].identitySyncStatus.syncedCount, 'subscription identitySyncStatus.syncedCount should be zero').to.equal(0);
      expect(subscriptions[0].identitySyncStatus.failedCount, 'subscription identitySyncStatus.failedCount should be zero').to.equal(0);
      expect(subscriptions[0].identitySyncStatus.pendingCount, 'subscription identitySyncStatus.pendingCount should be zero').to.equal(0);
      expect(subscriptions[0].identitySyncStatus.unknownCount, 'subscription identitySyncStatus.unknownCount should be zero').to.equal(0);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscriptions for fgaUser02
  it('fgaUser02 has authorization to get ALLOWED subscription 2', async () => {
    let response;
    try {
      response = await subscriptionApi.subscriptions(fgaToken02, {
        orgId: org01._id,
      });
      const subscriptions = response.data.data.subscriptions;
      expect(subscriptions).to.have.length(1);
      expect(subscriptions[0].name).to.equal(testSubscription2.name);
      expect(subscriptions[0].identitySyncStatus, 'subscription did not include identitySyncStatus').to.exist;
      expect(subscriptions[0].identitySyncStatus.syncedCount, 'subscription identitySyncStatus.syncedCount should be zero').to.equal(0);
      expect(subscriptions[0].identitySyncStatus.failedCount, 'subscription identitySyncStatus.failedCount should be zero').to.equal(0);
      expect(subscriptions[0].identitySyncStatus.pendingCount, 'subscription identitySyncStatus.pendingCount should be zero').to.equal(0);
      expect(subscriptions[0].identitySyncStatus.unknownCount, 'subscription identitySyncStatus.unknownCount should be zero').to.equal(0);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscription
  it('fgaUser01 has authorization to get subscription by subscription 1 uuid', async () => {
    let response;
    try {
      response = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
      });
      expect(response.data.errors).to.be.undefined;
      const subscription = response.data.data.subscription;
      expect(subscription.name).to.equal(testSubscription1.name);
      expect(subscription.groupObjs).to.exist;
      expect(subscription.groupObjs.length).to.equal(1);
      expect(subscription.groupObjs[0].uuid).to.equal(testGroup1.uuid);
      expect(subscription.versionObj).to.exist;
      expect(subscription.versionObj.name).to.equal( testVersion1.name );
      expect(subscription.versionObj.remote).to.exist;
      expect(subscription.versionObj.remote.parameters).to.exist;
      expect(subscription.versionObj.remote.parameters.length).to.equal(1);
      expect(subscription.versionObj.remote.parameters[0].key).to.equal( 'key1' );
      expect(subscription.versionObj.remote.parameters[0].value).to.equal( 'val1' );
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscription without authorization
  it('fgaUser02 does NOT have authorization to get subscription 1 by subscription 1 uuid', async () => {
    let response;
    try {
      response = await subscriptionApi.subscription(fgaToken02, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
      });
      expect(response.data.data.subscription).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('Subscription not found');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscriptionByName
  it('fgaUser01 has authorization to get subscription 1 by subscription 1 name', async () => {
    let response;
    try {
      response = await subscriptionApi.subscriptionByName(fgaToken01, {
        orgId: org01._id,
        name: testSubscription1.name,
      });
      expect(response.data.errors).to.be.undefined;
      expect(response.data.data.subscriptionByName.uuid).to.equal(testSubscription1.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscrptionByName without authorization
  it('fgaUser02 does NOT have authorization to get subscription 1 by subscription name', async () => {
    let response;
    try {
      response = await subscriptionApi.subscriptionByName(fgaToken02, {
        orgId: org01._id,
        name: testSubscription1.name,
      });
      expect(response.data.data.subscriptionByName).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('Subscription not found');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscriptionForCluster
  it('fgaUser01 has authorization to get subscriptions by clusterId for cluster 1', async () => {
    let response;
    try {
      await assignClusterGroups( fgaToken01, org01._id, [testGroup1.uuid], testCluster1.cluster_id );
      response = await subscriptionApi.subscriptionsForCluster(fgaToken01, {
        orgId: org01._id,
        clusterId: testCluster1.cluster_id,
      });
      expect(response.data.data.subscriptionsForCluster[0].uuid).to.equal(testSubscription1.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscriptionForCluster without authorization
  it('fgaUser02 does NOT have authorization to get subscriptions by clusterId for cluster 1', async () => {
    let response;
    try {
      response = await subscriptionApi.subscriptionsForCluster(fgaToken02, {
        orgId: org01._id,
        clusterId: testCluster1.cluster_id,
      });
      expect(response.data.data.subscriptionsForCluster).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscriptionForClusterByName
  it('fgaUser01 has authorization to get subscriptions by clusterName for cluster 1', async () => {
    let response;
    try {
      response = await subscriptionApi.subscriptionsForClusterByName(fgaToken01, {
        orgId: org01._id,
        clusterName: testCluster1.registration.name,
      });
      expect(response.data.data.subscriptionsForClusterByName[0].uuid).to.equal(testSubscription1.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // subscriptionForClusterByName without authorization
  it('fgaUser02 does NOT have authorization to get subscriptions by clusterName for cluster 1', async () => {
    let response;
    try {
      response = await subscriptionApi.subscriptionsForClusterByName(fgaToken02, {
        orgId: org01._id,
        clusterName: testCluster1.registration.name,
      });
      expect(response.data.data.subscriptionsForClusterByName).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // addSubscripiton
  it('fgaUser01 has authorization to add subscription 1', async () => {
    let response;
    try {
      response = await subscriptionApi.addSubscription(fgaToken01, {
        orgId: org01._id,
        name: testSubscription1.uuid,
        groups:[testGroup1.uuid],
        channelUuid: testChannel1.uuid,
        versionUuid: testVersion1.uuid,
      });
      expect(response.data.data.addSubscription.uuid).to.be.an('string');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // addSubscription without authorization
  it('fgaUser01 does NOT have authorization to add subscription 3', async () => {
    let response;
    try {
      response = await subscriptionApi.addSubscription(fgaToken01, {
        orgId: org01._id,
        name: 'testSubscription3',
        groups:[testGroup1.uuid],
        channelUuid: testChannel1.uuid,
        versionUuid: testVersion1.uuid,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // editSubscription
  it('fgaUser01 has authorization to edit subscription 1', async () => {
    let response;
    try {
      // step 1: Edit the subscription
      response = await subscriptionApi.editSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
        name: 'test-subscription3', // new name
        groups:[testGroup1.uuid],
        channelUuid: testChannel1.uuid,
        versionUuid: testVersion1.uuid,
      });
      expect(response.data.data.editSubscription.uuid).to.be.an('string');
      expect(response.data.data.editSubscription.success).to.equal(true);

      // step 2: Get the updated subscription
      response = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
      });
      expect(response.data.data.subscription.name).to.equal('test-subscription3');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // editSubscription without authorization
  it('fgaUser01 does NOT have authorization to edit subscription 2', async () => {
    let response;
    try {
      response = await subscriptionApi.editSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription2.uuid,
        name: 'test-subscription3', // new name
        groups:[testGroup1.uuid],
        channelUuid: testChannel1.uuid,
        versionUuid: testVersion1.uuid,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // setSubscription
  it('fgaUser01 has authorization to set subscription 1 configurationVersion', async () => {
    let response;
    try {
      // step 1: Edit the subscription's configurationVerision
      response = await subscriptionApi.setSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
        versionUuid: testVersion1.uuid,
      });
      expect(response.data.data.setSubscription.uuid).to.be.an('string');
      expect(response.data.data.setSubscription.success).to.equal(true);

      // step 2: Get the updated subscription
      response = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
      });
      expect(response.data.data.subscription.versionUuid).to.equal(testVersion1.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // setSubscription without authorization
  it('fgaUser01 does NOT have authorization to set subscription 2 configurationVersion', async () => {
    let response;
    try {
      response = await subscriptionApi.setSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription2.uuid,
        versionUuid: testVersion2.uuid,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeSubscription
  it('fgaUser01 has authorization to remove subscription 1', async () => {
    let response;
    try {
      // step 1: Remove the subscription
      response = await subscriptionApi.removeSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
      });
      expect(response.data.data.removeSubscription.uuid).to.be.an('string');
      expect(response.data.data.removeSubscription.success).to.equal(true);

      // step 2: Validate the subscription is not there
      response = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription1.uuid,
      });
      expect(response.data.data.subscription).to.equal(null);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeSubscription without authorization
  it('fgaUser01 does NOT have authorization to remove subscription 2', async () => {
    let response;
    try {
      response = await subscriptionApi.removeSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: testSubscription2.uuid,
      });
      expect(response.data.data.removeSubscription).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });
});
