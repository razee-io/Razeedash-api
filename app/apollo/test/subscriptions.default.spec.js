/**
 * Copyright 2020 IBM Corp. All Rights Reserved.
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
const { MongoMemoryServer } = require('mongodb-memory-server');

const { models } = require('../models');
const subscriptionsFunc = require('./subscriptionsApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { GraphqlPubSub } = require('../subscription');

// If external auth model specified, use it.  Else use built-in auth model.
const externalAuth = require('../../externalAuth.js');
const testHelperPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testPath : `./testHelper.${AUTH_MODEL}`;
const { prepareOrganization } = require(testHelperPath);
const testDataPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testDataPath : `./app/apollo/test/data/${AUTH_MODEL}`;

let mongoServer;
let myApollo;
const graphqlPort = 18000;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const subscriptionsApi = subscriptionsFunc(graphqlUrl);
let token;
let orgKey;

let org01Data;
let org01;

const channel_01_name = 'fake_channel_01';
const channel_01_uuid = 'fake_ch_01_uuid';

const sub_01_name = 'fake_sub_01';
const sub_01_uuid = 'fake_sub_01_uuid';
const sub_01_version = '0.0.1';
const sub_01_version_uuid = 'fake_sub_01_verison_uuid';
const sub_01_groups = 'dev';
const cluster_id = 'cluster_01';
const cluster_id_2 = 'cluster_02';

const sub_02_name = 'fake_sub_02';
const sub_02_uuid = 'fake_sub_02_uuid';
const sub_02_version = '0.0.1';
const sub_02_version_uuid = 'fake_sub_02_verison_uuid';
const sub_02_groups = 'prod';

const sub_03_name = 'fake_sub_03';
const sub_03_uuid = 'fake_sub_03_uuid';
const sub_03_version = '0.0.1';
const sub_03_version_uuid = 'fake_sub_03_verison_uuid';
const sub_03_groups = 'prod';

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
};


const createClusters = async () => {
  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'cluster_01',
    groups: [
      {
        'uuid': 'e7ed4820-2c7b-4e11-b53b-7b3551d65b65',
        'name': 'dev'
      }
    ],
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
  });
  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'cluster_02',
    groups: [
      {
        'uuid': 'aaaaa-aaaa-aaaa-aaaa-aaaa',
        'name': 'blah'
      }
    ],
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
  });
};


const createChannels = async () => {
  await models.Channel.create({
    _id: 'fake_ch_id_1',
    org_id: org01._id,
    uuid: channel_01_uuid,
    name: channel_01_name,
    versions: [
      {
        uuid: sub_01_version_uuid,
        name: sub_01_version,
        description: 'test01'
      },
      {
        uuid: sub_02_version_uuid,
        name: sub_02_version,
        description: 'test02'
      },
      {
        uuid: sub_03_version_uuid,
        name: sub_03_version,
        description: 'test03'
      },
    ]
  });

};

const createSubscriptions = async () => {
  await models.Subscription.create({
    _id: 'fake_sub_id_1',
    org_id: org01._id,
    name: sub_01_name,
    uuid: sub_01_uuid,
    groups: sub_01_groups,
    channel_uuid: channel_01_uuid,
    channelName: channel_01_name,
    version: sub_01_version,
    version_uuid: sub_01_version_uuid,
    owner: 'tester'
  });

  await models.Subscription.create({
    _id: 'fake_sub_id_2',
    org_id: org01._id,
    name: sub_02_name,
    uuid: sub_02_uuid,
    groups: sub_02_groups,
    channel_uuid: channel_01_uuid,
    channelName: channel_01_name,
    version: sub_02_version,
    version_uuid: sub_02_version_uuid,
    owner: 'tester'
  });

  await models.Subscription.create({
    _id: 'fake_sub_id_3',
    org_id: org01._id,
    name: sub_03_name,
    uuid: sub_03_uuid,
    groups: sub_03_groups,
    channel_uuid: channel_01_uuid,
    channelName: channel_01_name,
    version: sub_03_version,
    version_uuid: sub_03_version_uuid,
    owner: 'tester',
    custom: { forEnv: 'testing', forType: 'testing' }
  });
};

const getOrgKey = async () => {
  const presetOrgs = await models.Organization.find();
  return presetOrgs[0].orgKeys[0];
};

describe('subscriptions graphql test suite', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer( { binary: { version: '4.2.17' } } );
    await mongoServer.start();
    const mongoUrl = mongoServer.getUri();
    console.log(`    cluster.js in memory test mongodb url is ${mongoUrl}`);

    myApollo = await apollo({ mongo_url: mongoUrl, graphql_port: graphqlPort, });

    await createOrganizations();
    await createChannels();
    await createClusters();
    await createSubscriptions();
    orgKey = await getOrgKey();
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    GraphqlPubSub.deleteInstance();
    await mongoServer.stop();
  }); // after

  it('get should return SystemSubscriptions and regular subscriptions for a cluster with a group/subscription', async () => {
    try {
      const {
        data: {
          data: { subscriptionsByClusterId },
        },
      } = await subscriptionsApi.subscriptionsByClusterId(token, {
        clusterId: cluster_id
      }, orgKey);

      expect(subscriptionsByClusterId).to.have.length(5); // four SystemSubscriptions, one test subscription
      expect(subscriptionsByClusterId[0].subscriptionName).to.equal('system-primaryorgkey');  // PrimaryOrgKey SystemSubscription is expected to be first
      expect(subscriptionsByClusterId[1].subscriptionName).to.equal('system-clustersubscription');
      expect(subscriptionsByClusterId[2].subscriptionName).to.equal('system-remoteresource');
      expect(subscriptionsByClusterId[3].subscriptionName).to.equal('system-watchkeeper');
      expect(subscriptionsByClusterId[4].subscriptionName).to.equal('fake_sub_01'); // Test subscription
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get should return only SystemSubscriptions when a cluster has no matching groups', async () => {
    try {
      const {
        data: {
          data: { subscriptionsByClusterId },
        },
      } = await subscriptionsApi.subscriptionsByClusterId(token, {
        clusterId: cluster_id_2
      }, orgKey);
      expect(subscriptionsByClusterId).to.have.length(4); // four SystemSubscriptions, zero test subscriptions
      expect(subscriptionsByClusterId[0].subscriptionName).to.equal('system-primaryorgkey');  // PrimaryOrgKey SystemSubscription is expected to be first
      expect(subscriptionsByClusterId[1].subscriptionName).to.equal('system-clustersubscription');
      expect(subscriptionsByClusterId[2].subscriptionName).to.equal('system-remoteresource');
      expect(subscriptionsByClusterId[3].subscriptionName).to.equal('system-watchkeeper');
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
