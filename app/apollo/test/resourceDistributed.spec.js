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
// const why = require('why-is-node-running');

const apiFunc = require('./api');
const { models } = require('../models');
const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { prepareUser, prepareOrganization, signInUser } = require(`./testHelper.${AUTH_MODEL}`);

let mongoServer;
let mongoServerEUDE;
let myApollo;
const graphqlPort = 18005;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const api = apiFunc(graphqlUrl);

let org01Data;
let org02Data;
let org_01;
let org_02;

let user01Data;

let presetOrgs;
let presetUsers;
let presetResources;

const createOrganizations = async () => {
  org01Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.org_01.json`, 'utf8'));
  org_01 = await prepareOrganization(models, org01Data);

  org02Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.org_02.json`, 'utf8'));
  org_02 = await prepareOrganization(models, org02Data);

  console.log(`org_01 is ${org_01}, org_02 is ${org_02}`);
};

const createUsers = async () => {

  user01Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.user01.json`, 'utf8'));
  await prepareUser(models, user01Data);

  return {};
};

const createResources = async () => {
  console.log(
    `models.ResourceDistributed length = ${models.ResourceDistributed.length}`,
  );

  await models.ResourceDistributed[0].create({
    org_id: org_01._id,
    cluster_id: 'cluster_01_in_us',
    selfLink: 'any_selfLink',
    hash: 'any_hash',
    deleted: false,
    data: 'any_data',
    searchableData: { key01: 'any value 01', key02: 'any value 02' },
    searchableDataHash: 'some random hash.',
  });
  await models.ResourceDistributed[0].create({
    org_id: org_01._id,
    cluster_id: 'cluster_02_in_us',
    selfLink: 'any_selfLink_deleted',
    hash: 'any_hash',
    deleted: true,
    data: 'any_data',
    searchableData: { key01: 'any value 01', key02: 'any value 02' },
    searchableDataHash: 'some random hash.',
  });
  await models.ResourceDistributed[1].create({
    org_id: org_01._id,
    cluster_id: 'cluster_02_in_eu',
    selfLink: '/mybla/selfLink',
    hash: 'any_hash',
    deleted: false,
    data: 'any_data',
    searchableData: { key01: 'any value 01', key02: 'any value 02' },
    searchableDataHash: 'some random hash.',
  });
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

const getPresetResources = async () => {
  presetResources = await models.Resource.find();
  presetResources = presetResources.map(resource => {
    return resource.toJSON();
  });
  console.log(`presetResources=${JSON.stringify(presetResources)}`);
};

describe('resourceDistributed graphql test suite', () => {
  // eslint-disable-next-line no-unused-vars
  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer();
    const mongo_url = await mongoServer.getConnectionString();
    console.log(
      `resourceDistributed.spec.js in memory test mongodb url is ${mongo_url}`,
    );
    mongoServerEUDE = new MongoMemoryServer();
    const mongoUrlEude = await mongoServerEUDE.getConnectionString();
    const mongo_urls = `${mongo_url};${mongoUrlEude}`;
    console.log(
      `resourceDistributed.spec.js in memory test mongodb urls is ${mongo_urls}`,
    );
    myApollo = await apollo({ mongo_url, mongo_urls, graphql_port: graphqlPort });
    await createOrganizations();
    await createUsers();
    await createResources();

    await getPresetOrgs();
    await getPresetUsers();
    await getPresetResources();
    //setTimeout(function() {
    // why(); // logs out active handles that are keeping node running
    //}, 5000);
  });

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
    await mongoServerEUDE.stop();
  });

  describe('resourceDistributed(_id: ID!): Resource', () => {
    let token;

    it('a user should see a resource by given _id from distributed DBs', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);
        const result1 = await api.resourcesDistributed(token, {
          org_id: meResult.data.data.me.org_id,
          filter: 'mybla',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourcesDistributed[0].selfLink).to.equal(
          '/mybla/selfLink',
        );

        const { _id } = result1.data.data.resourcesDistributed[0];
        const result2 = await api.resourceDistributed(token, { _id });
        console.log(JSON.stringify(result2.data));
        expect(result2.data.data.resourceDistributed._id).to.equal(_id);
        expect(result2.data.data.resourceDistributed.selfLink).to.equal(
          '/mybla/selfLink',
        );

        const result3 = await api.resourceDistributed(token, {
          _id: '5deea2b9e7de2a430badbeef',
        });
        console.log(JSON.stringify(result3.data));
        expect(result3.data.data.resourceDistributed).to.equal(null);
      } catch (error) {
        // console.error('error response is ', error.response);
        console.error('error response is ', JSON.stringify(error));
        throw error;
      }
    });
  });

  describe('resourceDistributedByKeys(org_id: String! cluster_id: String! selfLink: String!): Resource', () => {
    let token;

    it('a user should see a resource by given org_id, cluster_id, and selfLink from distributed DBs', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);

        const result1 = await api.resourceDistributedByKeys(token, {
          org_id: meResult.data.data.me.org_id,
          cluster_id: 'cluster_01_in_us',
          selfLink: 'any_selfLink',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourceDistributedByKeys.cluster_id).to.equal(
          'cluster_01_in_us',
        );
        expect(result1.data.data.resourceDistributedByKeys.selfLink).to.equal(
          'any_selfLink',
        );

        const result2 = await api.resourceDistributedByKeys(token, {
          org_id: meResult.data.data.me.org_id,
          cluster_id: 'cluster_01_in_us',
          selfLink: 'should_not_match_selfLink',
        });
        console.log(JSON.stringify(result2.data));
        expect(result2.data.data.resourceDistributedByKeys).to.equal(null);
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourcesDistributedCount (org_id: $org_id): Int', () => {
    let token;

    it('a user should total count of resources under his org from distributed DBs', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);

        const result1 = await api.resourcesDistributedCount(token, {
          org_id: meResult.data.data.me.org_id,
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourcesDistributedCount).to.equal(2);
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourcesDistributed (org_id: $org_id filter: $filter fromDate: $fromDate toDate: $toDate)', () => {
    let token;

    it('a user should see resources served from both mongo dbs', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);

        const result1 = await api.resourcesDistributed(token, {
          org_id: meResult.data.data.me.org_id,
          filter: 'selfLink',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourcesDistributed.length).to.equal(2);
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourcesDistributedByCluster(cluster_id: String! filter: String): [Resource!]', () => {
    let token;

    it('a user should only see resources for given cluster_id with optional filter from distributed DBs', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);

        const result1 = await api.resourcesDistributedByCluster(token, {
          org_id: meResult.data.data.me.org_id,
          cluster_id: 'cluster_01_in_us',
          filter: 'selfLink',
        });
        console.log(JSON.stringify(result1.data));
        expect(
          result1.data.data.resourcesDistributedByCluster[0].cluster_id,
        ).to.equal('cluster_01_in_us');
        expect(
          result1.data.data.resourcesDistributedByCluster[0].selfLink,
        ).to.equal('any_selfLink');

        const result2 = await api.resourcesDistributedByCluster(token, {
          org_id: meResult.data.data.me.org_id,
          cluster_id: 'cluster_02_in_eu',
          filter: 'selfLink',
        });
        console.log(JSON.stringify(result2.data));
        expect(
          result2.data.data.resourcesDistributedByCluster[0].cluster_id,
        ).to.equal('cluster_02_in_eu');
        expect(
          result2.data.data.resourcesDistributedByCluster[0].selfLink,
        ).to.equal('/mybla/selfLink');
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });
});
