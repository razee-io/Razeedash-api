/**
 * Copyright 2020, 2023 IBM Corp. All Rights Reserved.
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

const { expect } = require('chai');
const fs = require('fs');
const { v4: UUID } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { models } = require('../models');
const resourceFunc = require('./api');
const subscriptionFunc = require('./subscriptionsApi');
const groupFunc = require('./groupApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');

// If external auth model specified, use it.  Else use built-in auth model.
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
const resourceApi = resourceFunc(graphqlUrl);
const subscriptionApi = subscriptionFunc(graphqlUrl);
const groupApi = groupFunc(graphqlUrl);

let fgaToken01;
let fgaToken02;

let org01Data;
let org01;

let fgaUser01Data;
let fgaUser02Data;

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
  await models.Channel.create({
    _id: 'fake_ch_id_1',
    org_id: org01._id,
    uuid: 'testConfiguration1',
    name: 'test-configuration1',
    versions: []  /* channel versions is deprecated and no longer used */
  });
  await models.Channel.create({
    _id: 'fake_ch_id_2',
    org_id: org01._id,
    uuid: 'testConfiguration2',
    name: 'test-configuration2',
    versions: []  /* channel versions is deprecated and no longer used */
  });
};

const createVersions = async () => {
  await models.DeployableVersion.create({
    _id: 'fake_ver_id_1',
    org_id: org01._id,
    uuid: 'testVersion1',
    name: 'test-version1',
    channel_id: 'testConfiguration1',
    channel_name: 'test-configuration1',
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
  });
  await models.DeployableVersion.create({
    _id: 'fake_ver_id_2',
    org_id: org01._id,
    uuid: 'testVersion2',
    name: 'test-version2',
    channel_id: 'testConfiguration2',
    channel_name: 'test-configuration2',
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
  });
};

const createGroups = async () => {
  await models.Group.create({
    _id: UUID(),
    org_id: org01._id,
    uuid: 'testGroup1',
    name: 'testGroup1',
    owner: 'undefined'
  });
  await models.Group.create({
    _id: UUID(),
    org_id: org01._id,
    uuid: 'testGroup2',
    name: 'testGroup2',
    owner: 'undefined'
  });
};

const createSubscriptions = async () => {
  // Subscription 01 is owned by fgaUser01
  await models.Subscription.create({
    _id: 'fga_subscription_id_1',
    org_id: org01._id,
    uuid: 'testSubscription1',
    name: 'testSubscription1',
    owner: 'undefined',
    groups: ['testGroup1'],
    channel_uuid: 'testConfiguration1',
    channel: 'test-configuration1',
    version: 'test-version1',
    version_uuid: 'testVersion1',
  });
  // Subscription 02 is owned by fgaUser02 and has tags
  await models.Subscription.create({
    _id: 'fga_subscription_id_2',
    org_id: org01._id,
    uuid: 'testSubscription2',
    name: 'testSubscription2',
    owner: 'undefined',
    groups: ['testGroup2'],
    channel_uuid: 'testConfiguration2',
    channel: 'test-configuration2',
    version: 'test-version2',
    version_uuid: 'testVersion2',
    tags: ['test-tag']
  });
};

const createClusters = async () => {
  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'testCluster1',
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
    registration: { name: 'test-cluster1' }
  });
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

    fgaToken01 = await signInUser(models, resourceApi, fgaUser01Data);
    fgaToken02 = await signInUser(models, resourceApi, fgaUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    GraphqlPubSub.deleteInstance();
    await mongoServer.stop();
  }); // after

  // subscriptions
  it('fgaUser01 has authentication to get subscriptions', async () => {
    try {
      const result = await subscriptionApi.subscriptions(fgaToken01, {
        orgId: org01._id,
      });
      const subscriptions = result.data.data.subscriptions;
      expect( subscriptions ).to.have.length(1);
      for( const subscription of subscriptions ) {
        expect( subscription.identitySyncStatus, 'subscription did not include identitySyncStatus' ).to.exist;
        expect( subscription.identitySyncStatus.syncedCount, 'subscription identitySyncStatus.syncedCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.failedCount, 'subscription identitySyncStatus.failedCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.pendingCount, 'subscription identitySyncStatus.pendingCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.unknownCount, 'subscription identitySyncStatus.unknownCount should be zero' ).to.equal(0);
      }
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscriptions without authentication to all subscriptions
  it('fgaUser02 does NOT have authentication to get ALL subscriptions', async () => {
    try {
      const result = await subscriptionApi.subscriptions(fgaToken02, {
        orgId: org01._id,
      });
      const subscriptions = result.data.data.subscriptions;
      expect( subscriptions ).to.have.length(1);
      for( const subscription of subscriptions ) {
        expect( subscription.identitySyncStatus, 'subscription did not include identitySyncStatus' ).to.exist;
        expect( subscription.identitySyncStatus.syncedCount, 'subscription identitySyncStatus.syncedCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.failedCount, 'subscription identitySyncStatus.failedCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.pendingCount, 'subscription identitySyncStatus.pendingCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.unknownCount, 'subscription identitySyncStatus.unknownCount should be zero' ).to.equal(0);
      }
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscription
  it('fgaUser01 has authentication to get subscription by subscription uuid', async () => {
    try {
      const result = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
      });
      console.log( `subscription result.data: ${JSON.stringify(result.data,null,2)}` );

      expect(result.data.errors).to.be.undefined;
      const subscription = result.data.data.subscription;
      expect(subscription.name).to.equal('testSubscription1');
      expect(subscription.groupObjs).to.exist;
      expect(subscription.groupObjs.length).to.equal(1);
      expect(subscription.groupObjs[0].uuid).to.equal('testGroup1');
      expect(subscription.versionObj).to.exist;
      expect(subscription.versionObj.name).to.equal( 'test-version1' );
      expect(subscription.versionObj.remote).to.exist;
      expect(subscription.versionObj.remote.parameters).to.exist;
      expect(subscription.versionObj.remote.parameters.length).to.equal(1);
      expect(subscription.versionObj.remote.parameters[0].key).to.equal( 'key1' );
      expect(subscription.versionObj.remote.parameters[0].value).to.equal( 'val1' );

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscription without authentication
  it('fgaUser02 does NOT have authentication to get subscription by subscription uuid', async () => {
    try {
      const result = await subscriptionApi.subscription(fgaToken02, {
        orgId: org01._id,
        uuid: 'testSubscription1',
      });
      const subscription = result.data.data.subscription;

      expect(subscription).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscriptionByName
  it('fgaUser01 has authentication to get subscription by subscription name', async () => {
    try {
      const result = await subscriptionApi.subscriptionByName(fgaToken01, {
        orgId: org01._id,
        name: 'testSubscription1',
      });

      expect(result.data.errors).to.be.undefined;
      const subscriptionByName = result.data.data.subscriptionByName;
      expect(subscriptionByName.uuid).to.equal('testSubscription1');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscrptionByName without authentication
  it('fgaUser02 does NOT have authentication to get subscription by subscription name', async () => {
    try {
      const result = await subscriptionApi.subscriptionByName(fgaToken02, {
        orgId: org01._id,
        name: 'test-subscription1',
      });
      const subscription = result.data.data.subscriptionByName;

      expect(subscription).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscriptionForCluster
  it('fgaUser01 has authentication to get subscriptions by clusterId', async () => {
    try {
      await assignClusterGroups( fgaToken01, org01._id, ['testGroup1'], 'testCluster1' );
      const result = await subscriptionApi.subscriptionsForCluster(fgaToken01, {
        orgId: org01._id,
        clusterId: 'testCluster1',
      });
      console.log( `subscriptions by clusterId result.data: ${JSON.stringify(result.data,null,2)}` );
      const subscriptionsForCluster = result.data.data.subscriptionsForCluster;

      expect(subscriptionsForCluster[0].uuid).to.equal('testSubscription1');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscriptionForCluster without authentication
  it('fgaUser02 does NOT have authentication to get subscriptions by clusterId', async () => {
    try {
      const result = await subscriptionApi.subscriptionsForCluster(fgaToken02, {
        orgId: org01._id,
        clusterId: 'testCluster1',
      });
      const subscription = result.data.data.subscriptionsForCluster;

      expect(subscription).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscriptionForClusterByName
  it('fgaUser01 has authentication to get subscriptions by clusterName', async () => {
    try {
      const result = await subscriptionApi.subscriptionsForClusterByName(fgaToken01, {
        orgId: org01._id,
        clusterName: 'test-cluster1',
      });
      const subscriptionsForCluster = result.data.data.subscriptionsForClusterByName;

      expect(subscriptionsForCluster[0].uuid).to.equal('testSubscription1');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // subscriptionForClusterByName without authentication
  it('fgaUser02 does NOT have authentication to get subscriptions by clusterName', async () => {
    try {
      const result = await subscriptionApi.subscriptionsForClusterByName(fgaToken02, {
        orgId: org01._id,
        clusterName: 'test-cluster1',
      });
      const subscriptionsForCluster = result.data.data.subscriptionsForClusterByName;

      expect(subscriptionsForCluster).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // addSubscripiton
  it('fgaUser01 has authentication to add subscriptions', async () => {
    try {
      const result = await subscriptionApi.addSubscription(fgaToken01, {
        orgId: org01._id,
        name: 'testSubscription1',
        groups:['testGroup1'],
        channelUuid: 'testConfiguration1',
        versionUuid: 'testVersion1',
      });

      expect(result.data.data.addSubscription.uuid).to.be.an('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // addSubscription without authentication
  it('fgaUser01 does NOT have authentication to add subscriptions', async () => {
    try {
      const result = await subscriptionApi.addSubscription(fgaToken01, {
        orgId: org01._id,
        name: 'testSubscription3',
        groups:['testGroup1'],
        channelUuid: 'testConfiguration1',
        versionUuid: 'testVersion1',
      });

      expect(result.data.data).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // editSubscription
  it('fgaUser01 has authentication to edit subscriptions', async () => {
    try {
      // Edit the subscription
      const result = await subscriptionApi.editSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
        name: 'test-subscription3', // new name
        groups:['testGroup1'],
        channelUuid: 'testConfiguration1',
        versionUuid: 'testVersion1',
      });
      const {
        data: {
          data: { editSubscription },
        },
      } = result;

      expect(editSubscription.uuid).to.be.an('string');
      expect(editSubscription.success).to.equal(true);

      // Get the updated subscription
      const result2 = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
      });
      const {
        data: {
          data: { subscription },
        },
      } = result2;

      expect(subscription.name).to.equal('test-subscription3');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // editSubscription without authentication
  it('fgaUser01 does NOT have authentication to edit subscriptions', async () => {
    try {
      // Edit the subscription
      const result = await subscriptionApi.editSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription2',
        name: 'test-subscription3', // new name
        groups:['testGroup1'],
        channelUuid: 'testConfiguration1',
        versionUuid: 'testVersion1',
      });

      expect(result.data.data).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // setSubscription
  it('fgaUser01 has authentication to set a subscription configurationVersion', async () => {
    try {
      //step1, edit the subscription's configurationVerision
      const {
        data: {
          data: { setSubscription },
        },
      } = await subscriptionApi.setSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
        versionUuid: 'testVersion1',
      });

      expect(setSubscription.uuid).to.be.an('string');
      expect(setSubscription.success).to.equal(true);

      // Get the updated subscription
      const {
        data: {
          data: { subscription },
        },
      } = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
      });

      expect(subscription.versionUuid).to.equal('testVersion1');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // setSubscription without authentication
  it('fgaUser01 does NOT have authentication to set a subscription configurationVersion', async () => {
    try {
      //step1, edit the subscription's configurationVerision
      const result = await subscriptionApi.setSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
        versionUuid: 'testVersion2',
      });

      expect(result.data.data).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // removeSubscription
  it('fgaUser01 has authentication to remove a subscription', async () => {
    try {
      // Remove the subscription
      const {
        data: {
          data: { removeSubscription },
        },
      } = await subscriptionApi.removeSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
      });

      expect(removeSubscription.uuid).to.be.an('string');
      expect(removeSubscription.success).to.equal(true);

      // Validate the subscription is not there
      const {
        data: {
          data: { subscription },
        },
      } = await subscriptionApi.subscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription1',
      });

      expect(subscription).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // removeSubscription without authentication
  it('fgaUser01 does NOT have authentication to remove a subscription', async () => {
    try {
      //step1, remove the subscription
      const result = await subscriptionApi.removeSubscription(fgaToken01, {
        orgId: org01._id,
        uuid: 'testSubscription2',
      });

      expect(result.data.data.removeSubscription).to.equal(null);
      expect(result.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });
});
