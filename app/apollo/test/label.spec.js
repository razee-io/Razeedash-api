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
const labelFunc = require('./labelApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { v4: UUID } = require('uuid');
const { prepareUser, prepareOrganization, signInUser } = require(`./testHelper.${AUTH_MODEL}`);

let mongoServer;
let myApollo;

const graphqlPort = 18001;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const resourceApi = resourceFunc(graphqlUrl);
const clusterApi = clusterFunc(graphqlUrl);
const labelApi = labelFunc(graphqlUrl);
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

const createLabels = async () => {
  await models.Label.create({
    _id: UUID(),
    uuid: UUID(),
    orgId: org01._id,
    name: 'label1',
    owner: 'undefined'
  });
  await models.Label.create({
    _id: UUID(),
    uuid: UUID(),
    orgId: org01._id,
    name: 'label2',
    owner: 'undefined'
  });
  await models.Label.create({
    _id: UUID(),
    uuid: UUID(),
    orgId: org77._id,
    name: 'label1',
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
        complier: 'some compiler',
        platform: 'linux/amd64',
      },
    },
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
        complier: 'some compiler',
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
        complier: 'some compiler',
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
        complier: 'some compiler',
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
        complier: 'some compiler',
        platform: 'linux/amd64',
      },
    },
  });
}; // create clusters

describe('label graphql test suite', () => {
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
    await createLabels();
  
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

  it('get all labels by Org ID', async () => {
    try {
      const {
        data: {
          data: { labels },
        },
      } = await labelApi.labels(token, {
        orgId: org01._id,
      });

      console.log(`get all labels by Org ID: labels = ${JSON.stringify(labels)}`);
      expect(labels).to.be.an('array');
      expect(labels).to.have.length(2);
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