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
const resourceFunc = require('./api');
const groupFunc = require('./groupApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { v4: UUID } = require('uuid');

// If the current auth model does not support FGA, skip FGA unit tests without error.
if (AUTH_MODEL === 'extauthtest' || AUTH_MODEL === 'passport.local') {
  console.log(`Found non fine-grained auth model: ${AUTH_MODEL}. Skipping fine-grained auth tests.`);
  return process.exit(0);
}
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

let fgaToken01;
let fgaToken02;

let org01Data;
let org01;

let fineGrainedAuthUser01Data;
let fineGrainedAuthUser02Data;

const group_01_uuid = 'testGroup1';
const group_02_uuid = 'testGroup2';

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
  fineGrainedAuthUser01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/fga.spec.user01.json`,
      'utf8',
    ),
  );
  await prepareUser(models, fineGrainedAuthUser01Data);
  fineGrainedAuthUser02Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/fga.spec.user02.json`,
      'utf8',
    ),
  );
  await prepareUser(models, fineGrainedAuthUser02Data);
  return {};
};

const createGroups = async () => {
  await models.Group.create({
    _id: UUID(),
    uuid: group_01_uuid,
    org_id: org01._id,
    name: 'test-group1',
    owner: 'undefined'
  });
  await models.Group.create({
    _id: UUID(),
    uuid: group_02_uuid,
    org_id: org01._id,
    name: 'test-group2',
    owner: 'undefined'
  });
}; // create groups

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
    registration: { name: 'test-cluster1' },
  });
  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: 'testCluster2',
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
    registration: { name: 'test-cluster2' },
  });
}; // create clusters

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

const createSubscriptions = async () => {
  // Subscription 01 is owned by fgaUser01
  await models.Subscription.create({
    _id: 'fga_subscription_id_1',
    org_id: org01._id,
    uuid: 'testSubscription1',
    name: 'test-subscription1',
    owner: 'undefined',
    groups: ['test-group1'],
    channel_uuid: 'testConfiguration1',
    channel: 'test-configuration1',
    version: 'test-version1',
    version_uuid: 'testVersion1',
  });
  // Subscription 02 is owned by fgaUser02
  await models.Subscription.create({
    _id: 'fga_subscription_id_2',
    org_id: org01._id,
    uuid: 'testSubscription2',
    name: 'testSubscription2',
    owner: 'undefined',
    groups: ['test-group2'],
    channel_uuid: 'testConfiguration2',
    channel: 'test-configuration2',
    version: 'test-version2',
    version_uuid: 'testVersion2',
  });
};

const groupClusters = async () => {
  await models.Cluster.updateMany({
    org_id: org01._id,
    cluster_id: {$in: ['testCluster1']},
    'groups.uuid': {$nin: [group_01_uuid]}
  },
  {$push: {
    groups: {
      uuid: group_01_uuid,
      name: 'test-group1'
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

    fgaToken01 = await signInUser(models, resourceApi, fineGrainedAuthUser01Data);
    fgaToken02 = await signInUser(models, resourceApi, fineGrainedAuthUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  // groups fgaUser01
  it('fgaUser01 has authentication to get ALLOWED groups by Org ID', async () => {
    try {
      const {
        data: {
          data: { groups },
        },
      } = await groupApi.groups(fgaToken01, {
        orgId: org01._id,
      });
      console.log(`get all groups by Org ID: groups = ${JSON.stringify(groups)}`);

      expect(groups).to.be.an('array');
      expect(groups).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // groups fgaUser02
  it('fgaUser02 has authentication to get ALLOWED groups by Org ID', async () => {
    try {
      const {
        data: {
          data: { groups },
        },
      } = await groupApi.groups(fgaToken02, {
        orgId: org01._id,
      });
      console.log(`get all groups by Org ID: groups = ${JSON.stringify(groups)}`);

      expect(groups).to.be.an('array');
      expect(groups).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // group
  it('fgaUser01 has authentication to get group by id', async () => {
    try {
      const {
        data: {
          data: { group },
        },
      } = await groupApi.group(fgaToken01, {
        orgId: org01._id,
        uuid: group_01_uuid
      });
      console.log(`get group by id: group = ${JSON.stringify(group)}`);

      expect(group).to.be.an('Object');
      expect(group.subscriptionCount).to.equal(1);
      expect(group.clusterCount).to.equal(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // group without authentication
  it('fgaUser01 does NOT have authentication to get group by id', async () => {
    try {
      const {
        data: {
          data: { group },
        },
      } = await groupApi.group(fgaToken01, {
        orgId: org01._id,
        uuid: group_02_uuid
      });

      expect(group).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // groupByName
  it('fgaUser01 has authentication to get groups by name', async () => {
    try {
      const result = await groupApi.groupByName(fgaToken01, {
        orgId: org01._id,
        name: 'test-group1'
      });
      const {
        data: {
          data: { groupByName },
        },
      } = result;
      console.log(`get group by name: groupByName = ${JSON.stringify(groupByName)}`);

      expect(groupByName).to.be.an('Object');
      expect(groupByName.subscriptionCount).to.equal(1);
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

  // groupByName without authentication
  it('fgaUser01 does NOT have authentication to get groups by name', async () => {
    try {
      const result = await groupApi.groupByName(fgaToken01, {
        orgId: org01._id,
        name: 'test-group2'
      });
      const {
        data: {
          data: { groupByName },
        },
      } = result;

      expect(groupByName).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // addGroup
  it('fgaUser01 has authentication to add group', async () => {
    try {
      const {
        data: {
          data: { addGroup },
        },
      } = await groupApi.addGroup(fgaToken01, {
        orgId: org01._id,
        name: 'testGroup1'
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

  // addGroup without authentication
  it('fgaUser01 does NOT have authentication to add group', async () => {
    try {
      const result = await groupApi.addGroup(fgaToken01, {
        orgId: org01._id,
        name: 'testGroup2'
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // removeGroup
  it('fgaUser02 has authentication to remove a group by uuid', async () => {
    try {
      const {
        data: {
          data: { addGroup },
        },
      } = await groupApi.addGroup(fgaToken02, {
        orgId: org01._id,
        name: 'testGroup2'
      });
      const uuid = addGroup.uuid;
      const {
        data: {
          data: { removeGroup },
        },
      } = await groupApi.removeGroup(fgaToken02, {
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

  // removeGroup without authentication
  it('fgaUser01 does NOT have authentication to remove a group by uuid', async () => {
    try {
      const result = await groupApi.removeGroup(fgaToken01, {
        orgId: org01._id,
        uuid: 'testGroup1'
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // removeGroupByName
  it('fgaUser02 has authentication to remove a group by name', async () => {
    try {
      await groupApi.addGroup(fgaToken02, {
        orgId: org01._id,
        name: 'testGroup2'
      });
      const {
        data: {
          data: { removeGroupByName },
        },
      } = await groupApi.removeGroupByName(fgaToken02, {
        orgId: org01._id,
        name: 'testGroup2'
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

  // removeGroupByName without authentication
  it('fgaUser01 does NOT have authentication to remove a group by name', async () => {
    try {
      const result = await groupApi.removeGroupByName(fgaToken01, {
        orgId: org01._id,
        name: 'test-group2'
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // groupClusters
  it('fgaUser02 has authentication to group clusters', async () => {
    try {
      const {
        data: {
          data: { groupClusters },
        },
      } = await groupApi.groupClusters(fgaToken02, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['testCluster2']
      });

      expect(groupClusters.modified).to.equal(1);
      const cluster1 = await models.Cluster.findOne({org_id : org01._id, cluster_id: 'testCluster2'}).exec();
      expect(cluster1.groups).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // groupClusters without authentication
  it('fgaUser01 does NOT have authentication to group clusters', async () => {
    try {
      const result = await groupApi.groupClusters(fgaToken01, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['testCluster2']
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // unGroupClusters
  it('fgaUser02 has authentication to ungroup clusters', async () => {
    try {
      const {
        data: {
          data: { unGroupClusters },
        },
      } = await groupApi.unGroupClusters(fgaToken02, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['testCluster2']
      });

      expect(unGroupClusters.modified).to.equal(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // unGroupClusters without authentication
  it('fgaUser01 does NOT have authentication to ungroup clusters', async () => {
    try {
      const result = await groupApi.unGroupClusters(fgaToken01, {
        orgId: org01._id,
        uuid: group_02_uuid,
        clusters: ['testCluster2']
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // assignClustersGroups / unassignClusterGroups
  it('fgaUser01 has authentication to assignClusterGroups / unassignClusterGroups', async()=>{
    // assign
    var result = await groupApi.assignClusterGroups(fgaToken01, {
      orgId: org01._id,
      groupUuids: [group_01_uuid],
      clusterIds: ['testCluster1']
    });
    var assignClusterGroups = result.data.data.assignClusterGroups;

    expect(assignClusterGroups.modified).to.equal(2);

    // unassign
    result = await groupApi.unassignClusterGroups(fgaToken01, {
      orgId: org01._id,
      groupUuids: [group_01_uuid],
      clusterIds: ['testCluster1']
    });
    var unassignClusterGroups = result.data.data.unassignClusterGroups;

    expect(unassignClusterGroups.modified).to.equal(1);
  });

  // assignClustersGroups without authentication
  it('fgaUser01 does NOT have authentication to assignClusterGroups', async()=>{
    var result = await groupApi.assignClusterGroups(fgaToken01, {
      orgId: org01._id,
      groupUuids: [group_02_uuid],
      clusterIds: ['testCluster2']
    });

    expect(result.data.data).to.equal(null);
  });

  // unassignClusterGroups without authentication
  it('fgaUser01 does NOT have authentication to unassignClusterGroups', async()=>{
    const result = await groupApi.unassignClusterGroups(fgaToken01, {
      orgId: org01._id,
      groupUuids: [group_02_uuid],
      clusterIds: ['testCluster2']
    });

    expect(result.data.data).to.equal(null);
  });

  // editClusterGroups
  it('fgaUser01 has authentication to edit cluster groups', async () => {
    try {
      const {
        data: {
          data: { editClusterGroups },
        },
      } = await groupApi.editClusterGroups(fgaToken01, {
        orgId: org01._id,
        clusterId: 'testCluster1',
        groupUuids: [group_01_uuid],
      });

      expect(editClusterGroups.modified).to.equal(2);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // editClusterGroups without authentication
  it('fgaUser01 does NOT have authentication to edit cluster groups', async () => {
    try {
      const result = await groupApi.editClusterGroups(fgaToken01, {
        orgId: org01._id,
        clusterId: 'testCluster2',
        groupUuids: [group_02_uuid],
      });

      expect(result.data.data).to.equal(null);

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