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
const clusterFunc = require('./clusterApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { prepareUser, prepareOrganization, signInUser } = require(`./testHelper.${AUTH_MODEL}`);
const ObjectId = require('mongoose').Types.ObjectId;

let mongoServer;
let myApollo;

const graphqlPort = 18001;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const resourceApi = resourceFunc(graphqlUrl);
const clusterApi = clusterFunc(graphqlUrl);
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

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
  org77Data = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/cluster.spec.org_77.json`,
      'utf8',
    ),
  );
  org77 = await prepareOrganization(models, org77Data);
};

const createUsers = async () => {
  user01Data = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/cluster.spec.user01.json`,
      'utf8',
    ),
  );
  await prepareUser(models, user01Data);
  user77Data = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/cluster.spec.user77.json`,
      'utf8',
    ),
  );
  await prepareUser(models, user77Data);
  userRootData = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/cluster.spec.root.json`,
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
  });
}; // create clusters

describe('cluster graphql test suite', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer();
    const mongoUrl = await mongoServer.getConnectionString();
    console.log(`    cluster.js in memory test mongodb url is ${mongoUrl}`);

    myApollo = await apollo({
      mongo_url: mongoUrl,
      graphql_port: graphqlPort,
    });

    await createOrganizations();
    await createUsers();
    await createClusters();

    // Can be uncommented if you want to see the test data that was added to the DB
    //await getPresetOrgs();
    //await getPresetUsers();
    //await getPresetClusters();

    token = await signInUser(models, resourceApi, user01Data);
    adminToken = await signInUser(models, resourceApi, userRootData);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  it('get cluster by clusterID', async () => {
    try {
      const clusterId1 = 'cluster_01';
      const result = await clusterApi.byClusterID(token, {
        orgId: org01._id,
        clusterId: clusterId1,
      });
      const clusterByClusterId = result.data.data.clusterByClusterId;

      expect(clusterByClusterId.clusterId).to.equal(clusterId1);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get cluster by cluster name', async () => {
    try {
      const clusterId1 = 'cluster_01';
      const clusterName1 = 'my-cluster1';
      const result = await clusterApi.byClusterName(token, {
        orgId: org01._id,
        clusterName: clusterName1,
      });
      const clusterByClusterName = result.data.data.clusterByName;

      expect(clusterByClusterName.clusterId).to.equal(clusterId1);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get all clusters by Org ID', async () => {
    try {
      const {
        data: {
          data: { clustersByOrgId },
        },
      } = await clusterApi.byOrgID(token, {
        orgId: org01._id,
      });

      expect(clustersByOrgId).to.be.an('array');
      expect(clustersByOrgId).to.have.length(4);
      expect(clustersByOrgId[0].resources).to.be.an('array');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get clusters by Org ID with pagination', async () => {
    let next;

    try {
      const {
        data: {
          data: { clustersByOrgId },
        },
      } = await clusterApi.byOrgID(token, {
        orgId: org01._id,
        limit: 2,
      });
      
      expect(clustersByOrgId).to.be.an('array');
      expect(clustersByOrgId).to.have.length(2);
      expect(clustersByOrgId[0].clusterId).to.equal('cluster_04');
      expect(clustersByOrgId[1].clusterId).to.equal('cluster_03');

      next = clustersByOrgId[1].id;
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
    
    try {
      const {
        data: {
          data: { clustersByOrgId },
        },
      } = await clusterApi.byOrgID(token, {
        orgId: org01._id,
        limit: 2,
        startingAfter: next,
      });

      expect(clustersByOrgId).to.be.an('array');
      expect(clustersByOrgId).to.have.length(2);
      expect(clustersByOrgId[0].clusterId).to.equal('cluster_02');
      expect(clustersByOrgId[1].clusterId).to.equal('cluster_01');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with filter (cluster) on cluster ID', async () => {
    try {
      const {
        data: {
          data: { clusterSearch },
        },
      } = await clusterApi.search(token, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 45,
      });

      expect(clusterSearch).to.be.an('array');
      expect(clusterSearch).to.have.length(4);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with filter (cluster) on cluster ID, limit one document', async () => {
    try {
      const {
        data: {
          data: { clusterSearch },
        },
      } = await clusterApi.search(token, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 1,
      });

      expect(clusterSearch).to.be.an('array');
      expect(clusterSearch).to.have.length(1);
      expect(clusterSearch[0].clusterId).to.equal('cluster_04');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with NO filter on cluster ID', async () => {
    try {
      const {
        data: {
          data: { clusterSearch },
        },
      } = await clusterApi.search(token, {
        orgId: org01._id,
      });

      expect(clusterSearch).to.be.an('array');
      expect(clusterSearch).to.have.length(4);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with NO filter on cluster ID, limit one document', async () => {
    try {
      const {
        data: {
          data: { clusterSearch },
        },
      } = await clusterApi.search(token, {
        orgId: org01._id,
        limit: 1,
      });

      expect(clusterSearch).to.be.an('array');
      expect(clusterSearch).to.have.length(1);
      expect(clusterSearch[0].clusterId).to.equal('cluster_04');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get count of different kube versions for clusters in an org', async () => {
    try {
      const {
        data: {
          data: { clusterCountByKubeVersion },
        },
      } = await clusterApi.kubeVersionCount(token, { orgId: org01._id });
      expect(clusterCountByKubeVersion).to.be.an('array');
      expect(clusterCountByKubeVersion).to.have.length(2);
      expect(clusterCountByKubeVersion[0].id.minor).to.equal('16');
      expect(clusterCountByKubeVersion[1].id.minor).to.equal('17');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get all (inactive) clusters who have not been updated in last day', async () => {
    try {
      const {
        data: {
          data: { inactiveClusters },
        },
      } = await clusterApi.inactiveClusters(token, { orgId: org01._id });

      expect(inactiveClusters).to.be.an('array');
      expect(inactiveClusters).to.have.length(1);
      expect(inactiveClusters[0].clusterId).to.equal('cluster_04');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('user01 should NOT be able to delete cluster by clusterID', async () => {
    try {
      const clusterIdToBeDeleted = 'cluster_to_be_deleted_but_can_not_by_user01';
      await models.Cluster.create({
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
      });

      const data = await clusterApi.deleteClusterByClusterId(token, {
        orgId: org01._id,
        clusterId: clusterIdToBeDeleted,
      });
      expect(data.data.data).to.equal(null);
      expect(data.data.errors[0].message).to.be.a('string');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('delete cluster by clusterID by an admin user', async () => {
    try {
      const clusterIdToBeDeleted = 'cluster_to_be_deleted';
      await models.Cluster.create({
        _id: new ObjectId('aaaabbbbcccc'),
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
      });

      await models.Resource.create({
        _id: new ObjectId('ddddeeeeffff'),
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
      } = await clusterApi.deleteClusterByClusterId(adminToken, {
        orgId: org01._id,
        clusterId: clusterIdToBeDeleted,
      });

      expect(deleteClusterByClusterId.deletedClusterCount).to.equal(1);
      expect(deleteClusterByClusterId.deletedClusterCount).to.equal(1);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('delete clusters by an admin user', async () => {
    try {
      const clusterIdToBeDeleted = 'cluster_to_be_deleted';
      await models.Cluster.create({
        _id: new ObjectId('aaaabbbbcccc'),
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
      });

      await models.Resource.create({
        _id: new ObjectId('aaaabbbbccc2'),
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
          data: { deleteClusters },
        },
      } = await clusterApi.deleteClusters(adminToken, {
        orgId: org01._id,
        clusterId: clusterIdToBeDeleted,
      });

      expect(deleteClusters.deletedClusterCount).to.be.above(0);
      expect(deleteClusters.deletedResourceCount).to.be.above(0);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('register Cluster', async () => {
    try {
      const registerCluster = await clusterApi.registerCluster(adminToken, {
        orgId: org01._id,
        registration: { name: 'my-cluster123' },
      });
      expect(registerCluster.data.data.registerCluster.url).to.be.an('string');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('try to register a cluster with the same name', async () => {
    try {
      const registerCluster = await clusterApi.registerCluster(adminToken, {
        orgId: org01._id,
        registration: { name: 'my-cluster123' },
      });
      //expect(registerCluster.data.data.registerCluster.url).to.be.an('string');
      expect(registerCluster.data.errors[0].message).to.contain('Another cluster already exists with the same registration name');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });



  it('try to register a cluster when max # of clusters per account is reached', async () => {
    try {
      let registerCluster = await clusterApi.registerCluster(adminToken, {
        orgId: org01._id,
        registration: { name: 'my-cluster-plus-1' },
      });

      registerCluster = await clusterApi.registerCluster(adminToken, {
        orgId: org01._id,
        registration: { name: 'my-cluster-past-max' },
      });
      expect(registerCluster.data.errors[0].message).to.contain('You have exceeded the maximum amount of clusters for this org');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('pre register Cluster with more than expected json elements', async () => {
    try {
      const data = await clusterApi.registerCluster(adminToken, {
        orgId: org01._id,
        registration:   {
          'name': [ {
            'cluster-name': 'my-cluster',
            'user-name': 'user1' },
          {'cluster-name': 'my-cluster2',
            'user-name': 'user2'}],
          'location': [ {
            'location-name': 'location1',
            'user-name': 'user1' },
          {'location': 'location2',
            'user-name': 'user2'}]
        }
      });
      console.log(`data=${JSON.stringify(data.data)}`);
      expect(data.data.errors[0].message).to.have.string('The json object has more than');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('pre register Cluster with invalid cluster name', async () => {
    try {
      const data = await clusterApi.registerCluster(adminToken, {
        orgId: org01._id,
        registration: { name: 'my-cluster3$' },
      });
      console.log(`data=${JSON.stringify(data.data)}`);
      expect(data.data.errors[0].message).to.have.string('The registration');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('pre register Cluster with invalid mongo data', async () => {
    try {
      const data = await clusterApi.registerCluster(adminToken, {
        orgId: org01._id,
        registration: { name: 'asdasdasdtryrtygdfgdf', usersword: { $ne: 1 } },
      });
      console.log(`data=${JSON.stringify(data.data)}`);
      expect(data.data.errors[0].message).to.have.string('The json object registration contain illegal characters');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('enable registration url for Cluster by an admin user', async () => {
    try {
      const clusterIdEnableRegUrl = 'cluster_enable_reg_url';
      await models.Cluster.create({
        _id: new ObjectId('enableRegUrl'),
        org_id: org01._id,
        cluster_id: clusterIdEnableRegUrl,
        reg_state: 'registered',
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
      });

      const {
        data: {
          data: { enableRegistrationUrl },
        },
      } = await clusterApi.enableRegistrationUrl(adminToken, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });

      const result = await clusterApi.byClusterID(token, {
        orgId: org01._id,
        clusterId: clusterIdEnableRegUrl,
      });
      const clusterByClusterId = result.data.data.clusterByClusterId;

      expect(enableRegistrationUrl.url).to.be.an('string');
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
});