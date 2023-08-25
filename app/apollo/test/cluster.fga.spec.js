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
const Moment = require('moment');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { v4: UUID } = require('uuid');

const { models } = require('../models');
const authFunc = require('./api');
const clusterFunc = require('./clusterApi');

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

let mongoServer;
let myApollo;

const graphqlPort = 18001;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const authApi = authFunc(graphqlUrl);
const clusterApi = clusterFunc(graphqlUrl);

let fgaToken01, fgaToken02;
let fgaUser01Data, fgaUser02Data;
let org01Data, org01;
let testGroup1, testGroup2;
let testCluster1, noAuthCluster;
let testRegisterCluster =  'test-register-cluster-name'; // fgaUser02 has full authorization for testRegisterCluster

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
    reg_state: 'registering',
    created: new Moment().subtract(2, 'day').toDate(),
    updated: new Moment().subtract(2, 'day').toDate(),
  };
  await models.Cluster.create(testCluster1);
  noAuthCluster = {
    org_id: org01._id,
    cluster_id: 'no-auth-cluster-uuid',
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
    registration: { name: 'no-auth-cluster-name' },
    reg_state: 'registering',
    created: new Moment().subtract(2, 'day').toDate(),
    updated: new Moment().subtract(2, 'day').toDate(),
  };
  await models.Cluster.create(noAuthCluster);
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
  await models.Cluster.updateMany({
    org_id: org01._id,
    cluster_id: {$in: [noAuthCluster.cluster_id]},
    'groups.uuid': {$nin: [testGroup2.uuid]}
  },
  {$push: {
    groups: {
      uuid: testGroup2.uuid,
      name: testGroup2.name
    }
  }});
};

describe('cluster fine-grained authorization graphql test suite', () => {
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
    await groupClusters();

    fgaToken01 = await signInUser(models, authApi, fgaUser01Data);
    fgaToken02 = await signInUser(models, authApi, fgaUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  // clusterByClusterId
  it('fgaUser01 has authorization to get cluster 1 by clusterID', async () => {
    let response;
    try {
      const clusterId = testCluster1.cluster_id;
      response = await clusterApi.byClusterID(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterId,
      });
      const clusterByClusterId = response.data.data.clusterByClusterId;
      expect(clusterByClusterId.clusterId).to.equal(clusterId);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clusterbyClusterId without authorization
  it('fgaUser02 does NOT have authorization to get cluster 1 by clusterID', async () => {
    let response;
    try {
      response = await clusterApi.byClusterID(fgaToken02, {
        orgId: org01._id,
        clusterId: testCluster1.cluster_id,
      });
      expect(response.data.data.clusterByClusterId).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clusterByName
  it('fgaUser01 has authorization to get cluster 1 by cluster name', async () => {
    let response;
    try {
      const clusterId = testCluster1.cluster_id;
      const clusterName = testCluster1.registration.name;
      response = await clusterApi.byClusterName(fgaToken01, {
        orgId: org01._id,
        clusterName: clusterName,
      });
      const clusterByClusterName = response.data.data.clusterByName;
      expect(clusterByClusterName.clusterId).to.equal(clusterId);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clusterByName without authorization
  it('fgaUser01 does NOT have authorization to get cluster noAuthCluster by cluster name', async () => {
    let response;
    try {
      response = await clusterApi.byClusterName(fgaToken01, {
        orgId: org01._id,
        clusterName: noAuthCluster.registration.name,
      });
      expect(response.data.data.clusterByName).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clustersByOrgId for fgaUser01
  it('fgaUser01 has authorization to get all authorized clusters by Org ID', async () => {
    let response;
    try {
      response = await clusterApi.byOrgID(fgaToken01, {
        orgId: org01._id,
      });
      const clustersByOrgId = response.data.data.clustersByOrgId;
      expect(clustersByOrgId).to.be.an('array');
      expect(clustersByOrgId).to.have.length(1);
      expect(clustersByOrgId[0].resources).to.be.an('array');
      expect(clustersByOrgId[0].name).to.equal(testCluster1.name);

      // test skip and limit implementation
      response = await clusterApi.byOrgID(fgaToken01, {
        orgId: org01._id,
        skip: 1, limit: 1,
      });
      expect(response.data.data.clustersByOrgId[0]).to.equal(undefined);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clustersByOrgId for fgaUser02
  it('fgaUser02 gets zero authorized clusters when getting all clusters by Org ID', async () => {
    let response;
    try {
      response = await clusterApi.byOrgID(fgaToken02, {
        orgId: org01._id,
      });
      expect(response.data.data.clustersByOrgId).to.be.an('array');
      expect(response.data.data.clustersByOrgId).to.have.length(0);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // inactiveClusters for fgaUser01
  it('fgaUser01 has authorization to get (inactive) cluster 1 who has not been updated in last day', async () => {
    let response;
    try {
      response = await clusterApi.inactiveClusters(fgaToken01, { orgId: org01._id });
      const inactiveClusters = response.data.data.inactiveClusters;
      expect(inactiveClusters).to.be.an('array');
      expect(inactiveClusters).to.have.length(1);
      expect(inactiveClusters[0].clusterId).to.equal(testCluster1.cluster_id);
      expect(inactiveClusters[0].groups).to.have.length(1);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // inactiveClusters for fgaUser02
  it('fgaUser02 gets zero authorized clusters when getting (inactive) clusters who have not been updated in last day', async () => {
    let response;
    try {
      response = await clusterApi.inactiveClusters(fgaToken02, { orgId: org01._id });
      expect(response.data.data.inactiveClusters).to.be.an('array');
      expect(response.data.data.inactiveClusters).to.have.length(0);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clusterSearch for fgaUser01
  it('fgaUser01 has authorization to search cluster 1 with filter (cluster) on cluster ID', async () => {
    let response;
    try {
      response = await clusterApi.search(fgaToken01, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 45,
      });
      expect(response.data.data.clusterSearch).to.be.an('array');
      expect(response.data.data.clusterSearch).to.have.length(1);
      expect(response.data.data.clusterSearch[0].name).to.equal(testCluster1.name);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clusterSearch for fgaUser02
  it('fgaUser02 gets zero authorized clusters when searching with filter (cluster) on cluster ID', async () => {
    let response;
    try {
      response = await clusterApi.search(fgaToken02, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 45,
      });
      expect(response.data.data.clusterSearch).to.be.an('array');
      expect(response.data.data.clusterSearch).to.have.length(0);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clusterCountByKubeVersion for fgaUser01
  it('fgaUser01 has authorization to get count of different kube versions for cluster 1 in an org', async () => {
    let response;
    try {
      // step 1: Update the date to find the active and authorized cluster
      response = await models.Cluster.updateMany({
        org_id: org01._id,
        cluster_id: testCluster1.cluster_id,
      },
      {$set: {
        updated: new Moment().add(2, 'day').toDate()+1,
      }});

      // step 2: Find kubeVersionCount
      response = await clusterApi.kubeVersionCount(fgaToken01, { orgId: org01._id });
      const clusterCountByKubeVersion = response.data.data.clusterCountByKubeVersion;
      expect(clusterCountByKubeVersion).to.be.an('array');
      expect(clusterCountByKubeVersion).to.have.length(1);
      expect(clusterCountByKubeVersion[0].id.minor).to.equal('16');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // clusterCountByKubeVersion for fgaUser02
  it('fgaUser02 gets zero authorized clusters when getting count of different kube versions in an org', async () => {
    let response;
    try {
      response = await clusterApi.kubeVersionCount(fgaToken02, { orgId: org01._id });
      expect(response.data.data.clusterCountByKubeVersion).to.be.an('array');
      expect(response.data.data.clusterCountByKubeVersion).to.have.length(0);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // deleteClusterByClusterId without authorization
  it('fgaUser01 does NOT have authorization to delete cluster noAuthCluster by clusterID', async () => {
    let response;
    try {
      response = await clusterApi.deleteClusterByClusterId(fgaToken01, {
        orgId: org01._id,
        clusterId: noAuthCluster.cluster_id,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.be.a('string');
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;    }
  });

  // registerCluster // deleteClusterByClusterID
  it('fgaUser02 has authorization to create a new cluster by name, find it by name, and delete it by cluster_id', async () => {
    let response;
    try {
      // step 1: register new cluster
      response = await clusterApi.registerCluster(fgaToken02, {
        orgId: org01._id,
        registration: { name: testRegisterCluster },
      });
      expect(response.data.data.registerCluster.url).to.be.an('string');

      // step 2: find cluster by name
      response = await clusterApi.byClusterName(fgaToken02, {
        orgId: org01._id,
        clusterName: testRegisterCluster,
      });
      expect(response.data.data.clusterByName.status).to.equal('registered');

      // step 3: delete cluster by clusterId
      response = await clusterApi.deleteClusterByClusterId(fgaToken02, {
        orgId: org01._id,
        clusterId: response.data.data.clusterByName.clusterId,
      });
      const deleteClusterByClusterId = response.data.data.deleteClusterByClusterId;
      expect(deleteClusterByClusterId.deletedClusterCount).to.equal(1);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // registerCluster without authorization
  it('fgaUser01 does NOT have authorization to register noAuthCluster2', async () => {
    let response;
    try {
      response = await clusterApi.registerCluster(fgaToken01, {
        orgId: org01._id,
        registration: { name: 'noAuthCluster2' },
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

  // enableRegistrationURL
  it('fgaUser01 has authorization to enable registration url for cluster 1', async () => {
    let response;
    try {
      const clusterIdEnableRegUrl = testCluster1.cluster_id;
      response = await clusterApi.enableRegistrationUrl(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });
      expect(response.data.data.enableRegistrationUrl.url).to.be.an('string');
      expect(response.data.data.enableRegistrationUrl.headers['razee-org-key']).to.be.an('string');
      response = await clusterApi.byClusterID(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });
      expect(response.data.data.clusterByClusterId.regState).to.equal('registering');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // enableRegistrationURL without authorization
  it('fgaUser01 does NOT have authorization to enable registration url for cluster noAuthCluster', async () => {
    let response;
    try {
      const clusterIdEnableRegUrl = noAuthCluster.cluster_id;
      response = await clusterApi.enableRegistrationUrl(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });
      expect(response.data.data.enableRegistrationUrl).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });
});
