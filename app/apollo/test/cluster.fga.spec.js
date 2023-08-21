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
const Moment = require('moment');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { v4: UUID } = require('uuid');

const { models } = require('../models');
const resourceFunc = require('./api');
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

const ObjectId = require('mongoose').Types.ObjectId;

let mongoServer;
let myApollo;

const graphqlPort = 18001;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const resourceApi = resourceFunc(graphqlUrl);
const clusterApi = clusterFunc(graphqlUrl);

let fgaToken01;
let fgaToken02;

let org01Data;
let org01;

let fineGrainedAuthUser01Data;
let fineGrainedAuthUser02Data;

const group_01_uuid = 'testGroup1';
const group_02_uuid = 'testGroup2';
const org_01_orgkey = 'orgApiKey-0a9f5ee7-c879-4302-907c-238178ec9071';
const org_01_orgkey2 = {
  orgKeyUuid: 'fcb8af1e-e4f1-4e7b-8c52-0e8360b48a13',
  name: 'testOrgKey2',
  primary: true,
  key: 'dummy-key-value'
};

// If external auth model specified, use it.  Else use built-in auth model.

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01Data.orgKeys2 = [org_01_orgkey2];
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
    lastOrgKeyUuid: org_01_orgkey,
    registration: { name: 'test-cluster1' },
    reg_state: 'registering',
    created: new Moment().subtract(2, 'day').toDate(),
    updated: new Moment().subtract(2, 'day').toDate(),
  });
}; // create clusters

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
  await models.Cluster.updateMany({
    org_id: org01._id,
    cluster_id: {$in: ['noAuthCluster']},
    'groups.uuid': {$nin: [group_02_uuid]}
  },
  {$push: {
    groups: {
      uuid: group_02_uuid,
      name: 'test-group2'
    }
  }});
};

describe('cluster fine-grained authentication graphql test suite', () => {
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

    fgaToken01 = await signInUser(models, resourceApi, fineGrainedAuthUser01Data);
    fgaToken02 = await signInUser(models, resourceApi, fineGrainedAuthUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  // clusterByClusterId
  it('fgaUser01 has authentication to get cluster by clusterID', async () => {
    try {
      const clusterId = 'testCluster1';
      const result = await clusterApi.byClusterID(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterId,
      });
      const clusterByClusterId = result.data.data.clusterByClusterId;

      expect(clusterByClusterId.clusterId).to.equal(clusterId);
      expect(clusterByClusterId.regState).to.equal('registering');  // record attr
      expect(clusterByClusterId.status).to.equal('registered'); // created ~= updated
      expect(clusterByClusterId.lastOrgKey.uuid).to.equal(org_01_orgkey);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // clusterbyClusterId without authentication
  it('fgaUser01 does NOT have authentication to get cluster by clusterID', async () => {
    try {
      const clusterId = 'noAuthCluster';
      const result = await clusterApi.byClusterID(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterId,
      });

      expect(result.data.data.clusterByClusterId).to.equal(null);
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

  // clusterByName
  it('fgaUser01 has authentication to get cluster by cluster name', async () => {
    try {
      const clusterId = 'testCluster1';
      const clusterName = 'test-cluster1';
      const result = await clusterApi.byClusterName(fgaToken01, {
        orgId: org01._id,
        clusterName: clusterName,
      });
      const clusterByClusterName = result.data.data.clusterByName;

      expect(clusterByClusterName.clusterId).to.equal(clusterId);
      expect(clusterByClusterName.regState).to.equal('registering');  // record attr
      expect(clusterByClusterName.status).to.equal('registered'); // created ~= updated
      expect(clusterByClusterName.lastOrgKey.uuid).to.equal(org_01_orgkey);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // clusterByName without authentication
  it('fgaUser01 does NOT have authentication to get cluster by cluster name', async () => {
    try {
      const clusterName = 'no-auth-cluster';
      const result = await clusterApi.byClusterName(fgaToken01, {
        orgId: org01._id,
        clusterName: clusterName,
      });

      expect(result.data.data.clusterByName).to.equal(null);
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

  // clustersByOrgId
  it('fgaUser01 has authentication to get all clusters by Org ID', async () => {
    try {
      const {
        data: {
          data: { clustersByOrgId },
        },
      } = await clusterApi.byOrgID(fgaToken01, {
        orgId: org01._id,
      });

      expect(clustersByOrgId).to.be.an('array');
      expect(clustersByOrgId).to.have.length(1);
      expect(clustersByOrgId[0].resources).to.be.an('array');
      expect(clustersByOrgId[0].lastOrgKey.name).to.equal(null);

      // test skip and limit implementation
      const skipResponse = await clusterApi.byOrgID(fgaToken01, {
        orgId: org01._id,
        skip: 1, limit: 1,
      });
      const skipLimitedClustersByOrgId = skipResponse.data.data.clustersByOrgId;

      expect(skipLimitedClustersByOrgId[0]).to.equal(undefined);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // clustersByOrgId without authentication
  it('fgaUser02 does NOT have authentication to get all clusters by Org ID', async () => {
    try {
      const {
        data: {
          data: { clustersByOrgId },
        },
      } = await clusterApi.byOrgID(fgaToken02, {
        orgId: org01._id,
      });

      expect(clustersByOrgId).to.be.an('array');
      expect(clustersByOrgId).to.have.length(0);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // inactiveClusters
  it('fgaUser01 has authentication to get all (inactive) clusters who have not been updated in last day', async () => {
    try {
      const {
        data: {
          data: { inactiveClusters },
        },
      } = await clusterApi.inactiveClusters(fgaToken01, { orgId: org01._id });

      expect(inactiveClusters).to.be.an('array');
      expect(inactiveClusters).to.have.length(1);
      expect(inactiveClusters[0].clusterId).to.equal('testCluster1');
      expect(inactiveClusters[0].groups).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // inactiveClusters without authentication
  it('fgaUser02 does NOT have authentication to get all (inactive) clusters who have not been updated in last day', async () => {
    try {
      const {
        data: {
          data: { inactiveClusters },
        },
      } = await clusterApi.inactiveClusters(fgaToken02, { orgId: org01._id });

      expect(inactiveClusters).to.be.an('array');
      expect(inactiveClusters).to.have.length(0);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // clusterSearch
  it('fgaUser01 has authentication to search cluster with filter (cluster) on cluster ID', async () => {
    try {
      const {
        data: {
          data: { clusterSearch },
        },
      } = await clusterApi.search(fgaToken01, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 45,
      });

      expect(clusterSearch).to.be.an('array');
      expect(clusterSearch).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // clusterSearch without authentication
  it('fgaUser02 does NOT have authentication to search cluster with filter (cluster) on cluster ID', async () => {
    try {
      const {
        data: {
          data: { clusterSearch },
        },
      } = await clusterApi.search(fgaToken02, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 45,
      });

      expect(clusterSearch).to.be.an('array');
      expect(clusterSearch).to.have.length(0);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // clusterCountByKubeVersion
  it('fgaUser01 has authentication to get count of different kube versions for clusters in an org', async () => {
    // Update the date to find the active and authorized cluster
    await models.Cluster.updateMany({
      org_id: org01._id,
      cluster_id: 'testCluster1',
    },
    {$set: {
      updated: new Moment().add(2, 'day').toDate()+1,
    }});

    try {
      const {
        data: {
          data: { clusterCountByKubeVersion },
        },
      } = await clusterApi.kubeVersionCount(fgaToken01, { orgId: org01._id });

      expect(clusterCountByKubeVersion).to.be.an('array');
      expect(clusterCountByKubeVersion).to.have.length(1);
      expect(clusterCountByKubeVersion[0].id.minor).to.equal('16');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // clusterCountByKubeVersion without authentication
  it('fgaUser02 does NOT have authentication to get count of different kube versions for clusters in an org', async () => {
    try {
      const {
        data: {
          data: { clusterCountByKubeVersion },
        },
      } = await clusterApi.kubeVersionCount(fgaToken02, { orgId: org01._id });

      expect(clusterCountByKubeVersion).to.be.an('array');
      expect(clusterCountByKubeVersion).to.have.length(0);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // deleteClusterByClusterId
  it('fgaUser02 has authentication to delete cluster by clusterID', async () => {
    try {
      const clusterIdToBeDeleted = 'testCluster2';
      await models.Cluster.create({
        _id: new ObjectId('fgaObject001'),
        org_id: org01._id,
        cluster_id: clusterIdToBeDeleted,
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
        registration: { name: 'test-cluster2' },
      });
      await models.Resource.create({
        _id: new ObjectId('fgaObject002'),
        org_id: org01._id,
        cluster_id: clusterIdToBeDeleted,
        selfLink: '/mybla/selfLink',
        hash: 'any_hash',
        deleted: false,
        data: 'any_data',
        searchableData: { key01: 'any value 01', key02: 'any value 02' },
        searchableDataHash: 'some random hash.',
      });
      const {
        data: {
          data: { deleteClusterByClusterId },
        },
      } = await clusterApi.deleteClusterByClusterId(fgaToken02, {
        orgId: org01._id,
        clusterId: clusterIdToBeDeleted,
      });

      expect(deleteClusterByClusterId.deletedClusterCount).to.equal(1);
      expect(deleteClusterByClusterId.deletedResourceCount).to.equal(1);
      expect(deleteClusterByClusterId.deletedResourceYamlHistCount).to.equal(0);
      expect(deleteClusterByClusterId.deletedServiceSubscriptionCount).to.equal(0);
      expect(deleteClusterByClusterId.url).to.be.an('string');
      expect(Object.getOwnPropertyNames(deleteClusterByClusterId.headers).length).to.equal(0);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // deleteClusterByClusterId without authentication
  it('fgaUser01 does NOT have authentication to delete cluster by clusterID', async () => {
    try {
      const clusterIdToBeDeleted = 'noAuthCluster';
      const result = await clusterApi.deleteClusterByClusterId(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterIdToBeDeleted,
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

  // registerCluster
  it('fgaUser02 has authentication to register Cluster', async () => {
    try {
      const registerCluster = await clusterApi.registerCluster(fgaToken02, {
        orgId: org01._id,
        registration: { name: 'testCluster2' },
      });
      console.log( `response: ${JSON.stringify( registerCluster.data, null, 2 )}` );

      expect(registerCluster.data.data.registerCluster.url).to.be.an('string');
      expect(registerCluster.data.data.registerCluster.headers['razee-org-key']).to.be.an('string');

      const result = await clusterApi.byClusterName(fgaToken02, {
        orgId: org01._id,
        clusterName: 'testCluster2',
      });

      expect(result.data.data.clusterByName.status).to.equal('registered');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // registerCluster without authentication
  it('fgaUser01 does NOT have authentication to register Cluster', async () => {
    try {
      const registerCluster = await clusterApi.registerCluster(fgaToken01, {
        orgId: org01._id,
        registration: { name: 'noAuthCluster2' },
      });
      console.log( `response: ${JSON.stringify( registerCluster.data, null, 2 )}` );

      expect(registerCluster.data.data).to.equal(null);
      expect(registerCluster.data.errors[0].message).to.be.a('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // enableRegistrationURL
  it('fgaUser01 has authentication to enable registration url for Cluster', async () => {
    try {
      const clusterIdEnableRegUrl = 'testCluster1';
      const {
        data: {
          data: { enableRegistrationUrl },
        },
      } = await clusterApi.enableRegistrationUrl(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });

      expect(enableRegistrationUrl.url).to.be.an('string');
      expect(enableRegistrationUrl.headers['razee-org-key']).to.be.an('string');

      const result = await clusterApi.byClusterID(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });
      const clusterByClusterId = result.data.data.clusterByClusterId;

      expect(clusterByClusterId.regState).to.equal('registering');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // enableRegistrationURL without authentication
  it('fgaUser01 does NOT have authentication to enable registration url for Cluster', async () => {
    try {
      const clusterIdEnableRegUrl = 'noAuthCluster';
      const {
        data: {
          data: { enableRegistrationUrl },
        },
      } = await clusterApi.enableRegistrationUrl(fgaToken01, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });

      expect(enableRegistrationUrl).to.equal(null);

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
