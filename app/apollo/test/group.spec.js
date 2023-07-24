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
const Moment = require('moment');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { models } = require('../models');
const resourceFunc = require('./api');
const groupFunc = require('./groupApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { v4: UUID } = require('uuid');

// If external auth model specified, use it.  Else use built-in auth model.
const externalAuth = require('../../externalAuth.js');
const testHelperPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testPath : `./testHelper.${AUTH_MODEL}`;
const { prepareUser, prepareOrganization, signInUser } = require(testHelperPath);
const testDataPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testDataPath : `./app/apollo/test/data/${AUTH_MODEL}`;

let mongoServer;
let myApollo;

const graphqlPort = 18001;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const resourceApi = resourceFunc(graphqlUrl);
const groupApi = groupFunc(graphqlUrl);
let token;
let adminToken;

let org01Data;
let org77Data;
let org01;
let org77;

let user01Data;
let user77Data;
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

const channelVersion_01_name = 'fake_channelVersion_01';
const channelVersion_01_uuid = 'fake_cv_01_uuid';

const channelVersion_02_name = 'fake_channelVersion_02';
const channelVersion_02_uuid = 'fake_cv_02_uuid';

const channelVersion_03_name = 'fake_channelVersion_03';
const channelVersion_03_uuid = 'fake_cv_03_uuid';

const subscription_01_name = 'fake_subscription_01';
const subscription_01_uuid = 'fake_sub_01_uuid';

const subscription_02_name = 'fake_subscription_02';
const subscription_02_uuid = 'fake_sub_02_uuid';

const subscription_03_name = 'fake_subscription_03';
const subscription_03_uuid = 'fake_sub_03_uuid';

const group_01_uuid = 'fake_group_01_uuid;';
const group_02_uuid = 'fake_group_02_uuid;';
const group_01_77_uuid = 'fake_group_01_77_uuid;';

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
  await prepareUser(models, user01Data);
  user77Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.user77.json`,
      'utf8',
    ),
  );
  await prepareUser(models, user77Data);
  userRootData = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.root.json`,
      'utf8',
    ),
  );
  await prepareUser(models, userRootData);
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

const createGroups = async () => {
  await models.Group.create({
    _id: UUID(),
    uuid: group_01_uuid,
    org_id: org01._id,
    name: 'group1',
    owner: 'undefined'
  });
  await models.Group.create({
    _id: UUID(),
    uuid: group_02_uuid,
    org_id: org01._id,
    name: 'group2',
    owner: 'undefined'
  });
  await models.Group.create({
    _id: UUID(),
    uuid: group_01_77_uuid,
    org_id: org77._id,
    name: 'group1',
    owner: 'undefined'
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
    registration: { name: 'mycluster-1' },
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
    registration: { name: 'mycluster-2' },
  });

  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'cluster_03',
    metadata: {
      kube_version: {
        major: '1',
        minor: '17',
        gitVersion: '1.99',
        gitCommit: 'abc',
        gitTreeState: 'def',
        buildDate: 'a_date',
        goVersion: '1.88',
        compiler: 'some compiler',
        platform: 'linux/amd64',
      },
    },
    registration: { name: 'mycluster-3' },
  });

  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'cluster_04',
    created: new Moment().subtract(2, 'day').toDate(),
    updated: new Moment().subtract(2, 'day').toDate(),
    metadata: {
      kube_version: {
        major: '1',
        minor: '17',
        gitVersion: '1.99',
        gitCommit: 'abc',
        gitTreeState: 'def',
        buildDate: 'a_date',
        goVersion: '1.88',
        compiler: 'some compiler',
        platform: 'linux/amd64',
      },
    },
    registration: { name: 'mycluster-4' },
  });

  // updated: new Moment().subtract(2, 'day').toDate(),

  await models.Cluster.create({
    org_id: org77._id,
    cluster_id: 'cluster_a',
    metadata: {
      kube_version: {
        major: '1',
        minor: '17',
        gitVersion: '1.99',
        gitCommit: 'abc',
        gitTreeState: 'def',
        buildDate: 'a_date',
        goVersion: '1.88',
        compiler: 'some compiler',
        platform: 'linux/amd64',
      },
    },
    registration: { name: 'mycluster-A' },
  });
}; // create clusters

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
};

const createSubscriptions = async () => {
  await models.Subscription.create({
    _id: 'fake_id_1',
    org_id: org01._id,
    uuid: subscription_01_uuid,
    name: subscription_01_name,
    owner: user01Data._id,
    groups: ['group1'],
    channel_uuid: channel_01_uuid,
    channel: channel_01_name,
    version: channelVersion_01_name,
    version_uuid: channelVersion_01_uuid,
  });

  await models.Subscription.create({
    _id: 'fake_id_2',
    org_id: org01._id,
    uuid: subscription_02_uuid,
    name: subscription_02_name,
    owner: user01Data._id,
    groups: ['group1', 'group2'],
    channel_uuid: channel_01_uuid,
    channel: channel_01_name,
    version: channelVersion_02_name,
    version_uuid: channelVersion_02_uuid,
  });

  await models.Subscription.create({
    _id: 'fake_id_3',
    org_id: org77._id,
    uuid: subscription_03_uuid,
    name: subscription_03_name,
    owner: user01Data._id,
    groups: ['group1'],
    channel_uuid: channel_02_uuid,
    channel: channel_02_name,
    version: channelVersion_03_name,
    version_uuid: channelVersion_03_uuid,
  });
};

const groupClusters = async () => {
  await models.Cluster.updateMany({
    org_id: org01._id,
    cluster_id: {$in: 'cluster_01'},
    'groups.uuid': {$nin: [group_01_uuid]}
  },
  {$push: {
    groups: {
      uuid: group_01_uuid,
      name: 'group1'
    }
  }});

  await models.Cluster.updateMany({
    org_id: org01._id,
    cluster_id: {$in: ['cluster_02','cluster_03']},
    'groups.uuid': {$nin: [group_02_uuid]}
  },
  {$push: {
    groups: {
      uuid: group_02_uuid,
      name: 'group2'
    }
  }});

  await models.Cluster.updateMany({
    org_id: org77._id,
    cluster_id: {$in: 'cluster_a'},
    'groups.uuid': {$nin: [group_01_77_uuid]}
  },
  {$push: {
    groups: {
      uuid: group_01_77_uuid,
      name: 'group1'
    }
  }});
};

describe('groups graphql test suite', () => {
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
    await createClusters();
    await createGroups();
    await createChannels();
    await createSubscriptions();
    await groupClusters();

    // Can be uncommented if you want to see the test data that was added to the DB
    // await getPresetOrgs();
    // await getPresetUsers();
    // await getPresetClusters();

    token = await signInUser(models, resourceApi, user01Data);
    adminToken = await signInUser(models, resourceApi, userRootData);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  it('get all groups by Org ID', async () => {
    try {
      const {
        data: {
          data: { groups },
        },
      } = await groupApi.groups(token, {
        orgId: org01._id,
      });
      console.log(`get all groups by Org ID: groups = ${JSON.stringify(groups)}`);
      expect(groups).to.be.an('array');
      expect(groups).to.have.length(2);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get groups by name', async () => {
    try {
      const result = await groupApi.groupByName(token, {
        orgId: org01._id,
        name: 'group1'
      });
      const {
        data: {
          data: { groupByName },
        },
      } = result;
      console.log(`get group by name: groupByName = ${JSON.stringify(groupByName)}`);
      expect(groupByName).to.be.an('Object');
      expect(groupByName.subscriptionCount).to.equal(2);
      expect(groupByName.clusterCount).to.equal(1);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get group by id', async () => {
    try {
      const {
        data: {
          data: { group },
        },
      } = await groupApi.group(token, {
        orgId: org01._id,
        uuid: group_02_uuid
      });
      console.log(`get group by id: group = ${JSON.stringify(group)}`);
      expect(group).to.be.an('Object');
      expect(group.subscriptionCount).to.equal(1);
      expect(group.clusterCount).to.equal(2);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add group', async () => {
    try {
      const {
        data: {
          data: { addGroup },
        },
      } = await groupApi.addGroup(adminToken, {
        orgId: org01._id,
        name: 'group3'
      });
      expect(addGroup.uuid).to.be.an('string');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('remove a group by uuid', async () => {
    try {
      const {
        data: {
          data: { addGroup },
        },
      } = await groupApi.addGroup(adminToken, {
        orgId: org01._id,
        name: 'group4'
      });
      const uuid = addGroup.uuid;
      const {
        data: {
          data: { removeGroup },
        },
      } = await groupApi.removeGroup(adminToken, {
        orgId: org01._id,
        uuid: uuid
      });
      expect(removeGroup.uuid).to.be.an('string');
      expect(removeGroup.success).to.equal(true);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('remove a group by name', async () => {
    try {
      const {
        data: {
          data: { removeGroupByName },
        },
      } = await groupApi.removeGroupByName(adminToken, {
        orgId: org01._id,
        name: 'group3'
      });
      expect(removeGroupByName.uuid).to.be.an('string');
      expect(removeGroupByName.success).to.equal(true);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('group clusters', async () => {
    try {
      const {
        data: {
          data: { groupClusters },
        },
      } = await groupApi.groupClusters(adminToken, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['cluster_01', 'cluster_04']
      });
      expect(groupClusters.modified).to.equal(2);
      const cluster1 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_01'}).exec();
      expect(cluster1.groups).to.have.length(2);
      const cluster4 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_04'}).exec();
      expect(cluster4.groups).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('group clusters with illegal character', async () => {
    try {
      const data = await groupApi.groupClusters(adminToken, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['cluster_01', 'cluster_04$']
      });
      expect(data.data.errors[0].message).to.have.string('should avoid leading or trailing whitespace and characters such as');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('group clusters with no passed clusters', async () => {
    try {
      const data = await groupApi.groupClusters(adminToken, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: []
      });
      expect(data.data.errors[0].message).to.have.string('No clusters were passed');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('ungroup clusters', async () => {
    try {
      const {
        data: {
          data: { unGroupClusters },
        },
      } = await groupApi.unGroupClusters(adminToken, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['cluster_01', 'cluster_04']
      });
      expect(unGroupClusters.modified).to.equal(2);
      const cluster1 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_01'}).exec();
      expect(cluster1.groups).to.have.length(1);
      const cluster4 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_04'}).exec();
      expect(cluster4.groups).to.have.length(0);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('ungroup clusters with no passed clusters', async () => {
    try {
      const {
        data: {
          data: { unGroupClusters },
        },
      } = await groupApi.unGroupClusters(adminToken, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: []
      });
      expect(unGroupClusters.modified).to.equal(0);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('ungroup clusters with non-existing cluster', async () => {
    try {
      const {
        data: {
          data: { unGroupClusters },
        },
      } = await groupApi.unGroupClusters(adminToken, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['cluster_99']
      });
      expect(unGroupClusters.modified).to.equal(0);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('assignClusterGroups / unassignClusterGroups', async()=>{
    // assign
    var result = await groupApi.assignClusterGroups(adminToken, {
      orgId: org01._id,
      groupUuids: [group_02_uuid],
      clusterIds: ['cluster_01', 'cluster_04']
    });
    var assignClusterGroups = result.data.data.assignClusterGroups;
    expect(assignClusterGroups.modified).to.equal(2);
    var cluster1 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_01'}).exec();
    expect(cluster1.groups).to.have.length(2);
    var cluster4 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_04'}).exec();
    expect(cluster4.groups).to.have.length(1);

    // unassign
    result = await groupApi.unassignClusterGroups(adminToken, {
      orgId: org01._id,
      groupUuids: [group_02_uuid],
      clusterIds: ['cluster_01', 'cluster_04']
    });
    var unassignClusterGroups = result.data.data.unassignClusterGroups;
    expect(unassignClusterGroups.modified).to.equal(2);
    cluster1 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_01'}).exec();
    expect(cluster1.groups).to.have.length(1);
    cluster4 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'cluster_04'}).exec();
    expect(cluster4.groups).to.have.length(0);
  });

  it('assign cluster groups with no passed clusters', async () => {
    try {
      var data = await groupApi.assignClusterGroups(adminToken, {
        orgId: org01._id,
        groupUuids: [group_02_uuid],
        clusterIds: []
      });
      expect(data.data.errors[0].message).to.have.string('No cluster uuids were passed');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('unassign cluster groups with no passed clusters', async () => {
    var result = await groupApi.unassignClusterGroups(adminToken, {
      orgId: org01._id,
      groupUuids: [group_02_uuid],
      clusterIds: []
    });
    var unassignClusterGroups = result.data.data.unassignClusterGroups;
    expect(unassignClusterGroups.modified).to.equal(0);
  });

  it('unassign cluster groups with a non-existing cluster', async () => {
    var result = await groupApi.unassignClusterGroups(adminToken, {
      orgId: org01._id,
      groupUuids: [group_02_uuid],
      clusterIds: ['cluster_99']
    });
    var unassignClusterGroups = result.data.data.unassignClusterGroups;
    expect(unassignClusterGroups.modified).to.equal(0);
  });

  it('edit cluster groups and remove passed cluster from all groups', async () => {
    try {
      const {
        data: {
          data: { editClusterGroups },
        },
      } = await groupApi.editClusterGroups(adminToken, {
        orgId: org01._id,
        clusterId: 'cluster_01',
        groupUuids: [],
      });
      expect(editClusterGroups.modified).to.equal(1);

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