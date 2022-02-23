/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
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

const { GraphqlPubSub } = require('../subscription');

//const why = require('why-is-node-running');


let mongoServer;
let myApollo;

const graphqlPort = 18006;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const resourceApi = resourceFunc(graphqlUrl);
const subscriptionApi = subscriptionFunc(graphqlUrl);
const groupApi = groupFunc(graphqlUrl);

let token01;
let token77;
let adminToken;

let org01Data;
let org77Data;
let org01;
let org77;

let user01;
let user01Data;
let user77;
let user77Data;
let userRoot;
let userRootData;

let presetOrgs;
let presetUsers;
let presetClusters;

const channel_01_name = 'fake_channel_01';
const channel_01_uuid = 'fake_ch_01_uuid';

const channel_02_name = 'fake_channel_02';
const channel_02_uuid = 'fake_ch_02_uuid';

const channel_03_name = 'fake_channel_03';
const channel_03_uuid = 'fake_ch_03_uuid';

const channel_04_name = 'fake_channel_04';
const channel_04_uuid = 'fake_ch_04_uuid';

const channelVersion_01_name = 'fake_channelVersion_01';
const channelVersion_01_uuid = 'fake_cv_01_uuid';

const channelVersion_02_name = 'fake_channelVersion_02';
const channelVersion_02_uuid = 'fake_cv_02_uuid';

const channelVersion_03_name = 'fake_channelVersion_03';
const channelVersion_03_uuid = 'fake_cv_03_uuid';

const channelVersion_04_name = 'fake_channelVersion_04';
const channelVersion_04_uuid = 'fake_cv_04_uuid';

const subscription_01_name = 'fake_subscription_01';
const subscription_01_uuid = 'fake_sub_01_uuid';

const subscription_02_name = 'fake_subscription_02';
const subscription_02_uuid = 'fake_sub_02_uuid';

const subscription_03_name = 'fake_subscription_03';
const subscription_03_uuid = 'fake_sub_03_uuid';

const subscription_04_name = 'fake_subscription_04';
const subscription_04_uuid = 'fake_sub_04_uuid';

const org01_group_dev_uuid = UUID();
const org01_group_stage_uuid = UUID();
const org77_group_dev_uuid = UUID();

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
  org77Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_77.json`,
      'utf8',
    ),
  );
  org77 = await prepareOrganization(models, org77Data);
};

const createUsers = async () => {
  user01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.user01.json`,
      'utf8',
    ),
  );
  user01 = await prepareUser(models, user01Data);
  user77Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.user77.json`,
      'utf8',
    ),
  );
  user77 = await prepareUser(models, user77Data);
  userRootData = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.root.json`,
      'utf8',
    ),
  );
  userRoot = await prepareUser(models, userRootData);
  return {};
};

// eslint-disable-next-line no-unused-vars
const getPresetOrgs = async () => {
  presetOrgs = await models.Organization.find();
  presetOrgs = presetOrgs.map(user => {
    return user.toJSON();
  });
  console.log(`presetOrgs=${JSON.stringify(presetOrgs)}`);
};

// eslint-disable-next-line no-unused-vars
const getPresetUsers = async () => {
  presetUsers = await models.User.find();
  presetUsers = presetUsers.map(user => {
    return user.toJSON();
  });
  console.log(`presetUsers=${JSON.stringify(presetUsers)}`);
};

// eslint-disable-next-line no-unused-vars
const getPresetClusters = async () => {
  presetClusters = await models.Cluster.find();
  presetClusters = presetClusters.map(cluster => {
    return cluster.toJSON();
  });
  console.log(`presetClusters=${JSON.stringify(presetClusters)}`);
};

const createChannels = async () => {
  await models.Channel.create({
    _id: 'fake_ch_id_1',
    org_id: org01._id,
    uuid: channel_01_uuid,
    name: channel_01_name,
    versions: [
      {
        uuid: channelVersion_01_uuid,
        name: channelVersion_01_name
      },
      {
        uuid: channelVersion_02_uuid,
        name: channelVersion_02_name
      }
    ]
  });

  await models.Channel.create({
    _id: 'fake_id_2',
    org_id: org01._id,
    uuid: channel_02_uuid,
    name: channel_02_name,
    versions: [
      {
        uuid: channelVersion_03_uuid,
        name: channelVersion_03_name
      }
    ]
  });

  await models.Channel.create({
    _id: 'fake_id_3',
    org_id: org77._id,
    uuid: channel_03_uuid,
    name: channel_03_name,
    versions: []
  });

  await models.Channel.create({
    _id: 'fake_id_4',
    org_id: org77._id,
    uuid: channel_04_uuid,
    name: channel_04_name,
    versions: [
      {
        uuid: channelVersion_04_uuid,
        name: channelVersion_04_name
      }
    ]
  });
};

const createGroups = async () => {
  await models.Group.create({
    _id: UUID(),
    org_id: org01._id,
    uuid: org01_group_dev_uuid,
    name: 'dev',
    owner: user01._id,
  });
  await models.Group.create({
    _id: UUID(),
    org_id: org01._id,
    uuid: org01_group_stage_uuid,
    name: 'stage',
    owner: user01._id,
  });
  await models.Group.create({
    _id: UUID(),
    org_id: org77._id,
    uuid: org77_group_dev_uuid,
    name: 'dev',
    owner: user01._id,
  });
};

const createSubscriptions = async () => {
  // Subscription 01 is owned by admin user
  await models.Subscription.create({
    _id: 'fake_id_1',
    org_id: org01._id,
    uuid: subscription_01_uuid,
    name: subscription_01_name,
    owner: userRoot._id,
    groups: ['dev'],
    channel_uuid: channel_01_uuid,
    channel: channel_01_name,
    version: channelVersion_01_name,
    version_uuid: channelVersion_01_uuid,
  });

  // Subscription 02 is owned by non-admin user
  await models.Subscription.create({
    _id: 'fake_id_2',
    org_id: org01._id,
    uuid: subscription_02_uuid,
    name: subscription_02_name,
    owner: user01._id,
    groups: ['stage'],
    channel_uuid: channel_01_uuid,
    channel: channel_01_name,
    version: channelVersion_02_name,
    version_uuid: channelVersion_02_uuid,
  });

  // Subscription 03 is owned by non-admin user
  await models.Subscription.create({
    _id: 'fake_id_3',
    org_id: org77._id,
    uuid: subscription_03_uuid,
    name: subscription_03_name,
    owner: user01._id,
    groups: ['dev'],
    channel_uuid: channel_02_uuid,
    channel: channel_02_name,
    version: channelVersion_03_name,
    version_uuid: channelVersion_03_uuid,
  });

  // Subscription 04 is owned by non-admin user
  await models.Subscription.create({
    _id: 'fake_id_4',
    org_id: org77._id,
    uuid: subscription_04_uuid,
    name: subscription_04_name,
    owner: user77._id,
    groups: ['dev'],
    channel_uuid: channel_04_uuid,
    channel: channel_04_name,
    version: channelVersion_04_name,
    version_uuid: channelVersion_04_uuid,
    custom: { forEnv: 'testing', forType: 'testing' }
  });
};

const createClusters = async () => {
  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'cluster_01',
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
    registration: { name: 'my-cluster1' }
  });
  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'cluster_02',
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
    registration: { name: 'my-cluster2' }
  });
};

const assignClusterGroups = async ( token, orgId, groupUUIDs, clusterUUID ) => {
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
};

const sleep = async ( ms ) => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

describe('subscription graphql test suite', () => {

  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer( { binary: { version: '4.2.17' } } );
    await mongoServer.start();
    const mongoUrl = mongoServer.getUri();
    console.log(`    cluster.js in memory test mongodb url is ${mongoUrl}`);

    myApollo = await apollo({
      mongo_url: mongoUrl,
      graphql_port: graphqlPort,
    });

    await createOrganizations();
    await createUsers();
    await createGroups();
    await createChannels();
    await createSubscriptions();
    await createClusters();

    token01 = await signInUser(models, resourceApi, user01Data);
    token77 = await signInUser(models, resourceApi, user77Data);
    adminToken = await signInUser(models, resourceApi, userRootData);

    // Assign cluster_01 to dev group as the admin user (important for RBAC Sync, as admin user owns subscripiton 01)
    //await assignClusterGroups( adminToken, org01._id, [org01_group_dev_uuid], 'cluster_01' );

    // Can be uncommented if you want to see the test data that was added to the DB
    //await getPresetOrgs();
    //await getPresetUsers();
    await getPresetClusters();
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    GraphqlPubSub.deleteInstance();
    await mongoServer.stop();
    // setTimeout(function() {
    //  why(); // logs out active handles that are keeping node running
    // }, 5000);
  }); // after

  it('get subscriptions', async () => {
    try {
      const result = await subscriptionApi.subscriptions(token01, {
        orgId: org01._id,
      });
      const subscriptions = result.data.data.subscriptions;
      expect( subscriptions ).to.have.length(2);
      // At this point, no clusters have been added to the group for subscription 01 or subscription 02.
      for( const subscription of subscriptions ) {
        expect( subscription.identitySyncStatus, 'subscription did not include identitySyncStatus' ).to.exist;
        expect( subscription.identitySyncStatus.syncedCount, 'subscription identitySyncStatus.syncedCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.failedCount, 'subscription identitySyncStatus.failedCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.pendingCount, 'subscription identitySyncStatus.pendingCount should be zero' ).to.equal(0);
        expect( subscription.identitySyncStatus.unknownCount, 'subscription identitySyncStatus.unknownCount should be zero' ).to.equal(0);
      }

      // Add cluster to group dev, triggering RBAC Sync as the admin user, who owns subscription 01 (dev group).  Status 'failed' expected.
      await assignClusterGroups( adminToken, org01._id, [org01_group_dev_uuid], 'cluster_01' );
      // Add cluster to group stage, triggering RBAC Sync as the admin user, who does NOT own subscription 02 (stage group).  Status 'unknown' expected.
      await assignClusterGroups( adminToken, org01._id, [org01_group_stage_uuid], 'cluster_02' );
      // Get subscriptions again.
      const result2 = await subscriptionApi.subscriptions(token01, {
        orgId: org01._id,
      });
      const subscriptions2 = result2.data.data.subscriptions;
      expect( subscriptions2 ).to.have.length(2);
      // subscription 01 should have failed sync status as it was triggered by the correct user by the sync API is not available.
      expect( subscriptions2[0].identitySyncStatus.syncedCount, 'subscription01 identitySyncStatus.syncedCount should be zero' ).to.equal(0);
      expect( subscriptions2[0].identitySyncStatus.failedCount, 'subscription01 identitySyncStatus.failedCount should be one' ).to.equal(1);
      expect( subscriptions2[0].identitySyncStatus.pendingCount, 'subscription01 identitySyncStatus.pendingCount should be zero' ).to.equal(0);
      expect( subscriptions2[0].identitySyncStatus.unknownCount, 'subscription01 identitySyncStatus.unknownCount should be zero' ).to.equal(0);
      // subscription 02 should have unknown sync status as it was triggered by a user other than the owner of the subscription.
      expect( subscriptions2[1].identitySyncStatus.syncedCount, 'subscription01 identitySyncStatus.syncedCount should be zero' ).to.equal(0);
      expect( subscriptions2[1].identitySyncStatus.failedCount, 'subscription01 identitySyncStatus.failedCount should be zero' ).to.equal(0);
      expect( subscriptions2[1].identitySyncStatus.pendingCount, 'subscription01 identitySyncStatus.pendingCount should be zero' ).to.equal(0);
      expect( subscriptions2[1].identitySyncStatus.unknownCount, 'subscription01 identitySyncStatus.unknownCount should be one' ).to.equal(1);

      // get subscriptions with custom attribute
      const result3 = await subscriptionApi.subscriptions(token77, {
        orgId: org77._id,
      });
      expect(result3.data.data.subscriptions).to.have.length(2);
      expect(Object.keys(result3.data.data.subscriptions[1].custom)).to.have.length(2);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get subscription by subscription uuid', async () => {
    try {
      const result = await subscriptionApi.subscription(token01, {
        orgId: org01._id,
        uuid: subscription_01_uuid,
      });
      expect(result.data.errors).to.be.undefined;
      const subscription = result.data.data.subscription;
      expect(subscription.name).to.equal(subscription_01_name);

      expect(subscription.groupObjs).to.exist;
      expect(subscription.groupObjs.length).to.equal(1);
      expect(subscription.groupObjs[0].uuid).to.equal(org01_group_dev_uuid);
      expect(subscription.groupObjs[0].clusters).to.exist;
      expect(subscription.groupObjs[0].clusters.length).to.equal(1);
      expect(subscription.groupObjs[0].clusters[0].clusterId).to.equal('cluster_01');
      expect(subscription.groupObjs[0].clusters[0].syncedIdentities).to.exist;
      expect(subscription.groupObjs[0].clusters[0].syncedIdentities[0].id).to.equal( userRoot._id );
      expect(subscription.groupObjs[0].clusters[0].syncedIdentities[0].syncStatus).to.equal( 'failed' );
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get subscription by subscription name', async () => {
    try {
      const result = await subscriptionApi.subscriptionByName(token01, {
        orgId: org01._id,
        name: subscription_01_name,
      });
      expect(result.data.errors).to.be.undefined;
      const subscriptionByName = result.data.data.subscriptionByName;
      expect(subscriptionByName.uuid).to.equal(subscription_01_uuid);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get subscriptions by clusterId', async () => {
    try {
      const result = await subscriptionApi.subscriptionsForCluster(adminToken, {
        orgId: org01._id,
        clusterId: 'cluster_01',
      });
      const subscriptionsForCluster = result.data.data.subscriptionsForCluster;
      expect(subscriptionsForCluster[0].uuid).to.equal(subscription_01_uuid);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get subscriptions by clusterName', async () => {
    try {
      const result = await subscriptionApi.subscriptionsForClusterByName(adminToken, {
        orgId: org01._id,
        clusterName: 'my-cluster1',
      });
      const subscriptionsForCluster = result.data.data.subscriptionsForClusterByName;
      expect(subscriptionsForCluster[0].uuid).to.equal(subscription_01_uuid);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a subscription', async () => {
    try {
      const {
        data: {
          data: { addSubscription },
        },
      } = await subscriptionApi.addSubscription(adminToken, {
        orgId: org01._id,
        name: 'a_random_name',
        groups:['dev'],
        channelUuid: channel_01_uuid,
        versionUuid: channelVersion_01_uuid,
      });
      expect(addSubscription.uuid).to.be.an('string');

      const addSubscription2 = await subscriptionApi.addSubscription(adminToken, {
        orgId: org01._id,
        name: 'a_random_name2',
        groups:['dev'],
        channelUuid: channel_01_uuid,
        versionUuid: channelVersion_02_uuid,
      });
      expect(addSubscription2.data.errors[0].message).to.equal(`Too many subscriptions are registered under ${org01._id}.`);

      // add subscription with custom attribute
      const result = await subscriptionApi.addSubscription(token77, {
        orgId: org77._id,
        name: 'a_random_name3',
        groups:['dev'],
        channelUuid: channel_04_uuid,
        versionUuid: channelVersion_04_uuid,
        custom: {
          'forEnv': 'testing',
          'forType': 'testing'
        },
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

  it('edit a subscription', async () => {
    try {
      //step1, edit the subscription
      const result = await subscriptionApi.editSubscription(adminToken, {
        orgId: org01._id,
        uuid: subscription_01_uuid,
        name: 'new-name',
        groups:['new-tag'],
        channelUuid: channel_02_uuid,
        versionUuid: channelVersion_03_uuid,
      });
      const {
        data: {
          data: { editSubscription },
        },
      } = result;
      expect(editSubscription.uuid).to.be.an('string');
      expect(editSubscription.success).to.equal(true);
      //step2, get the updated subscription
      const result2 = await subscriptionApi.subscription(adminToken, {
        orgId: org01._id,
        uuid: subscription_01_uuid,
      });
      const {
        data: {
          data: { subscription },
        },
      } = result2;
      expect(subscription.name).to.equal('new-name');
      expect(subscription.channelUuid).to.equal(channel_02_uuid);
      expect(subscription.versionUuid).to.equal(channelVersion_03_uuid);

      //step1, edit the subscription with custom attribute
      const result3 = await subscriptionApi.editSubscription(token77, {
        orgId: org77._id,
        uuid: subscription_04_uuid,
        name: 'new-name',
        groups:['new-tag'],
        channelUuid: channel_04_uuid,
        versionUuid: channelVersion_04_uuid,
        custom: {
          'forEnv': 'new',
          'forType': 'new'
        }
      });
      expect(result3.data.data.editSubscription.uuid).to.be.an('string');
      //step2, get the updated subscription
      const result4 = await subscriptionApi.subscription(token77, {
        orgId: org77._id,
        uuid: subscription_04_uuid,
      });
      expect(result4.data.data.subscription.name).to.equal('new-name');
      expect(result4.data.data.subscription.custom.forEnv).to.equal('new');
      expect(result4.data.data.subscription.custom.forType).to.equal('new');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('set a subscription configurationVersion', async () => {
    try {
      //step1, edit the subscription's configurationVerision
      const {
        data: {
          data: { setSubscription },
        },
      } = await subscriptionApi.setSubscription(adminToken, {
        orgId: org01._id,
        uuid: subscription_02_uuid,
        versionUuid: channelVersion_01_uuid,
      });
      expect(setSubscription.uuid).to.be.an('string');
      expect(setSubscription.success).to.equal(true);
      //step2, get the updated subscription
      const {
        data: {
          data: { subscription },
        },
      } = await subscriptionApi.subscription(adminToken, {
        orgId: org01._id,
        uuid: subscription_02_uuid,
      });
      expect(subscription.versionUuid).to.equal(channelVersion_01_uuid);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('remove a subscription', async () => {
    try {
      //step1, remove the subscription
      const {
        data: {
          data: { removeSubscription },
        },
      } = await subscriptionApi.removeSubscriptions(adminToken, {
        orgId: org01._id,
        uuid: subscription_01_uuid,
      });
      expect(removeSubscription.uuid).to.be.an('string');
      expect(removeSubscription.success).to.equal(true);
      //step2, validate the subscription is not there
      const {
        data: {
          data: { subscription },
        },
      } = await subscriptionApi.subscription(adminToken, {
        orgId: org01._id,
        uuid: subscription_01_uuid,
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
});
