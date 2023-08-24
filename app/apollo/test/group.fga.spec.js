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
const { MongoMemoryServer } = require('mongodb-memory-server');

const { models } = require('../models');
const authFunc = require('./api');
const groupFunc = require('./groupApi');

const apollo = require('../index');
const { v4: UUID } = require('uuid');
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

let mongoServer;
let myApollo;

const graphqlPort = 18001;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const authApi = authFunc(graphqlUrl);
const groupApi = groupFunc(graphqlUrl);

let fgaToken01, fgaToken02;
let fgaUser01Data, fgaUser02Data;
let org01Data, org01;
let testGroup1, testGroup2;
let testChannel1, testChannel2;
let testCluster1, testCluster2;
let testSubscription1, testSubscription2;

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
  testCluster2 = {
    org_id: org01._id,
    cluster_id: 'test-cluster2-uuid',
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
    registration: { name: 'test-cluster2-name' },
  };
  await models.Cluster.create(testCluster2);
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
    version: 'test-version1-name',
    version_uuid: 'test-version1-uuid',
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
    version: 'test-version2-name',
    version_uuid: 'test-version2-uuid',
  };
  await models.Subscription.create(testSubscription2);
};

const groupClusters = async () => {
  await models.Cluster.updateMany({
    org_id: org01._id,
    cluster_id: {$in: [testCluster1.cluster_id]},
    'groups.uuid': {$nin: [testGroup1.uuid]}
  },
  {$push: {
    groups: {
      uuid: testGroup1.uuid,
      name: testGroup1.name
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

    fgaToken01 = await signInUser(models, authApi, fgaUser01Data);
    fgaToken02 = await signInUser(models, authApi, fgaUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  // groups fgaUser01
  it('fgaUser01 has authorization to get ALLOWED groups by Org ID', async () => {
    let response;
    try {
      response = await groupApi.groups(fgaToken01, {
        orgId: org01._id,
      });
      expect(response.data.data.groups).to.be.an('array');
      expect(response.data.data.groups).to.have.length(1);
      expect(response.data.data.groups[0].name).to.equal(testGroup1.name);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // groups fgaUser02
  it('fgaUser02 has authorization to get ALLOWED groups by Org ID', async () => {
    let response;
    try {
      response = await groupApi.groups(fgaToken02, {
        orgId: org01._id,
      });
      expect(response.data.data.groups).to.be.an('array');
      expect(response.data.data.groups).to.have.length(1);
      expect(response.data.data.groups[0].name).to.equal(testGroup2.name);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // group
  it('fgaUser01 has authorization to get group 1 by id', async () => {
    let response;
    try {
      response = await groupApi.group(fgaToken01, {
        orgId: org01._id,
        uuid: testGroup1.uuid
      });
      expect(response.data.data.group).to.be.an('Object');
      expect(response.data.data.group.subscriptionCount).to.equal(1);
      expect(response.data.data.group.clusterCount).to.equal(1);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // group without authorization
  it('fgaUser01 does NOT have authorization to get group 2 by id', async () => {
    let response;
    try {
      response = await groupApi.group(fgaToken01, {
        orgId: org01._id,
        uuid: testGroup2.uuid
      });
      expect(response.data.data.group).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // groupByName
  it('fgaUser01 has authorization to get group 1 by name', async () => {
    let response;
    try {
      response = await groupApi.groupByName(fgaToken01, {
        orgId: org01._id,
        name: testGroup1.name
      });
      expect(response.data.data.groupByName).to.be.an('Object');
      expect(response.data.data.groupByName.subscriptionCount).to.equal(1);
      expect(response.data.data.groupByName.clusterCount).to.equal(1);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // groupByName without authorization
  it('fgaUser01 does NOT have authorization to get group 2 by name', async () => {
    let response;
    try {
      response = await groupApi.groupByName(fgaToken01, {
        orgId: org01._id,
        name: testGroup2.name
      });
      expect(response.data.data.groupByName).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // addGroup
  it('fgaUser01 has authorization to add group 1', async () => {
    let response;
    try {
      response = await groupApi.addGroup(fgaToken01, {
        orgId: org01._id,
        name: testGroup1.uuid // Adding by uuid for name to keep within test auth for fgaUser02
      });
      expect(response.data.data.addGroup.uuid).to.be.an('string');
      const group = await models.Group.findOne({uuid: response.data.data.addGroup.uuid});
      expect(group.name).to.equal(testGroup1.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // addGroup without authorization
  it('fgaUser01 does NOT have authorization to add group 2', async () => {
    let response;
    try {
      response = await groupApi.addGroup(fgaToken01, {
        orgId: org01._id,
        name: testGroup2.name
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeGroup
  it('fgaUser02 has authorization to add and remove a group by uuid', async () => {
    let response;
    try {
      response = await groupApi.addGroup(fgaToken02, {
        orgId: org01._id,
        name: testGroup2.uuid // Adding by uuid for name to keep within test auth for fgaUser02
      });
      response = await groupApi.removeGroup(fgaToken02, {
        orgId: org01._id,
        uuid: response.data.data.addGroup.uuid
      });
      expect(response.data.data.removeGroup.uuid).to.be.an('string');
      expect(response.data.data.removeGroup.success).to.equal(true);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeGroup without authorization
  it('fgaUser01 does NOT have authorization to remove group 2 by uuid', async () => {
    let response;
    try {
      response = await groupApi.removeGroup(fgaToken01, {
        orgId: org01._id,
        uuid: testGroup2.uuid
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeGroupByName
  it('fgaUser02 has authorization to remove group 2 by name', async () => {
    let response;
    try {
      response = await groupApi.addGroup(fgaToken02, {
        orgId: org01._id,
        name: testGroup2.uuid // Adding by uuid for name to keep within test auth for fgaUser02
      });
      response = await groupApi.removeGroupByName(fgaToken02, {
        orgId: org01._id,
        name: testGroup2.uuid // Adding by uuid for name to keep within test auth for fgaUser02
      });
      expect(response.data.data.removeGroupByName.uuid).to.be.an('string');
      expect(response.data.data.removeGroupByName.success).to.equal(true);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeGroupByName without authorization
  it('fgaUser01 does NOT have authorization to remove group 2 by name', async () => {
    let response;
    try {
      response = await groupApi.removeGroupByName(fgaToken01, {
        orgId: org01._id,
        name: testGroup2.name
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // groupClusters
  it('fgaUser02 has authorization to group cluster 2', async () => {
    let response;
    try {
      response = await groupApi.groupClusters(fgaToken02, {
        orgId: org01._id,
        uuid: testGroup2.uuid,
        clusters: [testCluster2.cluster_id]
      });
      expect(response.data.data.groupClusters.modified).to.equal(1);
      const cluster = await models.Cluster.findOne({org_id : org01._id, cluster_id: testCluster2.cluster_id}).exec();
      expect(cluster.groups).to.have.length(1);
      expect(cluster.groups[0].name).to.equal(testGroup2.name);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // groupClusters without authorization
  it('fgaUser01 does NOT have authorization to group cluster 2', async () => {
    let response;
    try {
      response = await groupApi.groupClusters(fgaToken01, {
        orgId: org01._id,
        uuid: testGroup2.uuid,
        clusters: [testCluster2.cluster_id]
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // unGroupClusters
  it('fgaUser02 has authorization to ungroup cluster 2', async () => {
    let response;
    try {
      response = await groupApi.unGroupClusters(fgaToken02, {
        orgId: org01._id,
        uuid: testGroup2.uuid,
        clusters: [testCluster2.cluster_id]
      });
      expect(response.data.data.unGroupClusters.modified).to.equal(1);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // unGroupClusters without authorization
  it('fgaUser01 does NOT have authorization to ungroup cluster 2', async () => {
    let response;
    try {
      response = await groupApi.unGroupClusters(fgaToken01, {
        orgId: org01._id,
        uuid: testGroup2.uuid,
        clusters: [testCluster2.cluster_id]
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // assignClustersGroups / unassignClusterGroups
  it('fgaUser01 has authorization to assignClusterGroups / unassignClusterGroups for group 1 and cluster 1', async()=>{
    let response;
    try {
      // assign
      response = await groupApi.assignClusterGroups(fgaToken01, {
        orgId: org01._id,
        groupUuids: [testGroup1.uuid],
        clusterIds: [testCluster1.cluster_id]
      });
      var assignClusterGroups = response.data.data.assignClusterGroups;
      expect(assignClusterGroups.modified).to.equal(2);

      // unassign
      response = await groupApi.unassignClusterGroups(fgaToken01, {
        orgId: org01._id,
        groupUuids: [testGroup1.uuid],
        clusterIds: [testCluster1.cluster_id]
      });
      var unassignClusterGroups = response.data.data.unassignClusterGroups;
      expect(unassignClusterGroups.modified).to.equal(1);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // assignClustersGroups without authorization
  it('fgaUser01 does NOT have authorization to assignClusterGroups for group 2 and cluster 2', async()=>{
    let response;
    try {
      response = await groupApi.assignClusterGroups(fgaToken01, {
        orgId: org01._id,
        groupUuids: [testGroup2.uuid],
        clusterIds: [testCluster2.cluster_id]
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('Query assignClusterGroups error'); // assignClusterGroups() reaches a QueryError before ForbiddenError
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // unassignClusterGroups without authorization
  it('fgaUser01 does NOT have authorization to unassignClusterGroups for group 2 and cluster 2', async()=>{
    let response;
    try {
      response = await groupApi.unassignClusterGroups(fgaToken01, {
        orgId: org01._id,
        groupUuids: [testGroup2.uuid],
        clusterIds: [testCluster2.cluster_id]
      });

      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('Query unassignClusterGroups error'); // unassignClusterGroups() reaches a QueryError before ForbiddenError
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // editClusterGroups
  it('fgaUser01 has authorization to editClusterGroups for group 1 and cluster 1', async () => {
    let response;
    try {
      response = await groupApi.editClusterGroups(fgaToken01, {
        orgId: org01._id,
        clusterId: testCluster1.cluster_id,
        groupUuids: [testGroup1.uuid],
      });
      expect(response.data.data.editClusterGroups.modified).to.equal(2);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // editClusterGroups without authorization
  it('fgaUser01 does NOT have authorization to editClusterGroups for group 2 and cluster 2', async () => {
    let response;
    try {
      response = await groupApi.editClusterGroups(fgaToken01, {
        orgId: org01._id,
        clusterId: testCluster2.cluster_id,
        groupUuids: [testGroup2.uuid],
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('Query editClusterGroups error'); // editClusterGroups() reaches a QueryError before ForbiddenError
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });
});