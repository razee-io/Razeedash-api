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

let mongoServer;
let mongoServerEUDE;
let myApollo;

const graphqlPort = 18002;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const resourceApi = resourceFunc(graphqlUrl);
const clusterApi = clusterFunc(graphqlUrl);
let token;

let org01Data;
let org77Data;
let org01;
let org77;

let user01Data;
let user77Data;

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
  return {};
};

const getPresetOrgs = async () => {
  presetOrgs = await models.Organization.find();
  presetOrgs = presetOrgs.map(user => {
    return user.toJSON();
  });
  console.log(`presetOrgs=${JSON.stringify(presetOrgs)}`);
};

const getPresetUsers = async () => {
  presetUsers = await models.User.find();
  presetUsers = presetUsers.map(user => {
    return user.toJSON();
  });
  console.log(`presetUsers=${JSON.stringify(presetUsers)}`);
};

const getPresetClusters = async () => {
  presetClusters = await models.Cluster.find();
  presetClusters = presetClusters.map(cluster => {
    return cluster.toJSON();
  });
  console.log(`presetClusters=${JSON.stringify(presetClusters)}`);
};

const createClusters = async () => {
  console.log(`createClusters length = ${models.ClusterDistributed.length}`);

  await models.ClusterDistributed[0].create({
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
  });

  await models.ClusterDistributed[1].create({
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

  await models.ClusterDistributed[0].create({
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

  await models.ClusterDistributed[1].create({
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

  await models.ClusterDistributed[1].create({
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

describe('clusterDistrubuted  graphql test suite', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer();
    const mongoUrl = await mongoServer.getConnectionString();
    console.log(
      `clusterDistrbuted.spec.js in memory test mongodb url is ${mongoUrl}`,
    );
    mongoServerEUDE = new MongoMemoryServer();
    const mongoUrlEude = await mongoServerEUDE.getConnectionString();
    const mongoUrls = `${mongoUrl};${mongoUrlEude}`;
    console.log(
      `clusterDistrbuted.spec.js in memory test mongodb urls is ${mongoUrls}`,
    );

    myApollo = await apollo({
      mongo_url: mongoUrl,
      mongo_urls: mongoUrls,
      graphql_port: graphqlPort,
    });

    await createOrganizations();
    await createUsers();
    await createClusters();

    await getPresetOrgs();
    await getPresetUsers();
    await getPresetClusters();

    token = await signInUser(models, resourceApi, user01Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
    await mongoServerEUDE.stop();

  }); // after

  it('get cluster by clusterID from distributed DBs', async () => {
    try {
      const clusterId1 = 'cluster_01';
      const {
        data: {
          data: { clusterDistributedByClusterId },
        },
      } = await clusterApi.byClusterIDDistributed(token, {
        orgId: org01._id,
        clusterId: clusterId1,
      });

      expect(clusterDistributedByClusterId.clusterId).to.equal(clusterId1);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get all clusters by Org ID from distributed DBs', async () => {
    try {
      const {
        data: {
          data: { clustersDistributedByOrgId },
        },
      } = await clusterApi.byOrgIDDistributed(token, {
        orgId: org01._id,
      });

      expect(clustersDistributedByOrgId).to.be.an('array');
      expect(clustersDistributedByOrgId).to.have.length(4);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with filter (cluster) on cluster ID from distributed DBs', async () => {
    try {
      const {
        data: {
          data: { clusterDistributedSearch },
        },
      } = await clusterApi.searchDistributed(token, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 50,
      });

      expect(clusterDistributedSearch).to.be.an('array');
      expect(clusterDistributedSearch).to.have.length(4);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with filter (cluster) on cluster ID, limit one document from each distributed DBs', async () => {
    try {
      const {
        data: {
          data: { clusterDistributedSearch },
        },
      } = await clusterApi.searchDistributed(token, {
        orgId: org01._id,
        filter: 'cluster',
        limit: 1,
      });

      expect(clusterDistributedSearch).to.be.an('array');
      expect(clusterDistributedSearch).to.have.length(2);
      expect(clusterDistributedSearch[0].clusterId).to.equal('cluster_03');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with NO filter on cluster ID from distributed DBs', async () => {
    try {
      const {
        data: {
          data: { clusterDistributedSearch },
        },
      } = await clusterApi.searchDistributed(token, {
        orgId: org01._id,
      });

      expect(clusterDistributedSearch).to.be.an('array');
      expect(clusterDistributedSearch).to.have.length(4);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('search cluster with NO filter on cluster ID, limit one document from  each distributed DBs', async () => {
    try {
      const {
        data: {
          data: { clusterDistributedSearch },
        },
      } = await clusterApi.searchDistributed(token, {
        orgId: org01._id,
        limit: 1,
      });

      expect(clusterDistributedSearch).to.be.an('array');
      expect(clusterDistributedSearch).to.have.length(2);
      expect(clusterDistributedSearch[0].clusterId).to.equal('cluster_03');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get count of different kube versions for clusters in an org from distributed DBs', async () => {
    // Note: cluster_04 is not included because its updated date has not been updated today.
    // This API only includes active clusters (i.e. updated field has been updated in the last day)
    try {
      const {
        data: {
          data: { clusterDistributedCountByKubeVersion },
        },
      } = await clusterApi.kubeVersionCountDistributed(token, {
        orgId: org01._id,
      });
      expect(clusterDistributedCountByKubeVersion).to.be.an('array');
      expect(clusterDistributedCountByKubeVersion).to.have.length(2);
      expect(clusterDistributedCountByKubeVersion[0].id.minor).to.equal('16');
      expect(clusterDistributedCountByKubeVersion[1].id.minor).to.equal('17');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });
  
  it('get all zombie clusters who have not been updated in last day from distributed DBs', async () => {
    try {
      const {
        data: {
          data: { clusterDistributedZombies },
        },
      } = await clusterApi.zombiesDistributed(token, {
        orgId: org01._id,
      });

      expect(clusterDistributedZombies).to.be.an('array');
      expect(clusterDistributedZombies).to.have.length(1);
      expect(clusterDistributedZombies[0].clusterId).to.equal('cluster_04');
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
