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

const {
  prepareUser,
  prepareOrganization,
  signInUser,
} = require(`./testHelper.${AUTH_MODEL}`);

const SubClient = require('./subClient');
const { resourceChangedFunc, pubSubPlaceHolder } = require('../subscription');

let mongoServer;
let myApollo;
const graphqlPort = 18004;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const subscriptionUrl = `ws://localhost:${graphqlPort}/graphql`;
const api = apiFunc(graphqlUrl);

let org01Data;
let org02Data;
let shouldNotMatchAnyData;

let org_01;
let org_02;
let shouldNotMatchAny;

let user01Data;
let user02Data;

let presetOrgs;
let presetUsers;
let presetResources;

const createOrganizations = async () => {
  org01Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.org_01.json`, 'utf8'));
  org_01 = await prepareOrganization(models, org01Data);

  org02Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.org_02.json`, 'utf8'));
  org_02 = await prepareOrganization(models, org02Data);

  shouldNotMatchAnyData = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.shouldNotMatchAny.json`, 'utf8'));
  shouldNotMatchAny = await prepareOrganization(models, shouldNotMatchAnyData);
};

const createUsers = async () => {

  user01Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.user01.json`, 'utf8'));
  await prepareUser(models, user01Data);

  user02Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/resource.spec.user02.json`, 'utf8'));
  await prepareUser(models, user02Data);

  return {};
};

const createResources = async () => {
  await models.Resource.create({
    org_id: shouldNotMatchAny._id,
    cluster_id: 'any_cluster_01',
    selfLink: 'any_selfLink',
    hash: 'any_hash',
    deleted: false,
    data: 'any_data',
    searchableData: { key01: 'any value 01', key02: 'any value 02' },
    searchableDataHash: 'some random hash.',
  });
  await models.Resource.create({
    org_id: org_01._id,
    cluster_id: 'cluster_01',
    selfLink: '/mybla/selfLink',
    hash: 'any_hash',
    deleted: false,
    data: 'any_data',
    searchableData: { key01: 'any value 01', key02: 'any value 02' },
    searchableDataHash: 'some random hash.',
  });
  await models.Resource.create({
    org_id: org_01._id,
    cluster_id: 'cluster_03',
    selfLink: '/mybla/selfLink/deleted',
    hash: 'any_hash',
    deleted: true,
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

describe('resource graphql test suite', () => {
  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer();
    const mongo_url = await mongoServer.getConnectionString();
    console.log(`resource.spec.js in memory test mongodb url is ${mongo_url}`);
    myApollo = await apollo({ mongo_url, graphql_port: graphqlPort });
    await createOrganizations();
    await createUsers();
    await createResources();

    await getPresetOrgs();
    await getPresetUsers();
    await getPresetResources();
    //setTimeout(function() {
    //  why(); // logs out active handles that are keeping node running
    //}, 5000);
  });

  after(async () => {
    await myApollo.stop(myApollo);
    if (pubSubPlaceHolder.enabled) {
      await pubSubPlaceHolder.pubSub.close();
    }
    await mongoServer.stop();
  });

  describe('resource(_id: ID!): Resource', () => {
    let token;

    it('a user should see a resource by given _id', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);
        const meResult = await api.me(token);

        const result1 = await api.resources(token, {
          org_id: meResult.data.data.me.org_id,
          filter: 'mybla',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resources[0].selfLink).to.equal(
          '/mybla/selfLink',
        );

        const { _id } = result1.data.data.resources[0];
        const result2 = await api.resource(token, { _id });
        console.log(JSON.stringify(result2.data));
        expect(result2.data.data.resource._id).to.equal(_id);
        expect(result2.data.data.resource.selfLink).to.equal('/mybla/selfLink');
      } catch (error) {
        // console.error('error response is ', error.response);
        console.error(
          'error response is ',
          JSON.stringify(error.response.data),
        );
        throw error;
      }
    });
  });

  describe('resourceByKeys(org_id: String! cluster_id: String! selfLink: String!): Resource', () => {
    let token;

    it('a user should see a resource by given org_id, cluster_id, and selfLink', async () => {
      try {

        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);

        const result1 = await api.resourceByKeys(token, {
          org_id: meResult.data.data.me.org_id,
          cluster_id: 'cluster_01',
          selfLink: '/mybla/selfLink',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourceByKeys.cluster_id).to.equal(
          'cluster_01',
        );
        expect(result1.data.data.resourceByKeys.selfLink).to.equal(
          '/mybla/selfLink',
        );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourcesCount: Int', () => {
    let token;

    it('a user should be able to get the total counts of resources', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);
        const result1 = await api.resourcesCount(token, {
          org_id: meResult.data.data.me.org_id,
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourcesCount).to.equal(1);
      } catch (error) {
        console.error('error response is ', error.response);
        console.error(
          'error response is ',
          JSON.stringify(error.response.data),
        );
        throw error;
      }
    });
  });

  describe('resources (filter: String): [Resource!]', () => {
    let token;

    it('a user should only see resources belongs to his organization', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);

        const result1 = await api.resources(token, {
          org_id: meResult.data.data.me.org_id,
          filter: 'mybla',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resources[0].selfLink).to.equal(
          '/mybla/selfLink',
        );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourcesByCluster(cluster_id: String! filter: String): [Resource!]', () => {
    let token;

    it('a user should only see resources for given cluster_id with optional filter', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);

        const result1 = await api.resourcesByCluster(token, {
          org_id: meResult.data.data.me.org_id,
          cluster_id: 'cluster_01',
          filter: 'selfLink',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourcesByCluster[0].cluster_id).to.equal(
          'cluster_01',
        );
        expect(result1.data.data.resourcesByCluster[0].selfLink).to.equal(
          '/mybla/selfLink',
        );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourceUpdated (org_id: String!, filter: String): ResourceUpdated!', () => {
    before(function() {
      if (pubSubPlaceHolder.enabled === false) {
        this.skip();
      }
    });

    let token;

    const aResource = {
      _id: 'some_fake_id',
      org_id: 'org_01',
      cluster_id: 'cluster_01',
      selfLink: '/ff/bla2',
      searchableData: { ttt: 'tt tt t1' },
    };

    const anotherResource = {
      _id: 'anther_fake_id',
      org_id: 'org_02',
      cluster_id: 'cluster_01',
      selfLink: '/ff/bla2',
      searchableData: { ttt: 'tt tt t1' },
    };

    it.only('a user subscribe an org and filter should be able to get notification is a new/updated resource matches', async () => {
      try {
        if (pubSubPlaceHolder.enabled === false) {
          return this.skip();
        }
        let dataReceivedFromSub;

        token = await signInUser(models, api, user02Data);
        console.log(`user02 token=${token}`);

        const subClient = new SubClient({
          wsUrl: subscriptionUrl,
          token,
        });
        const query = `subscription ($org_id: String!, $filter: String) {
          resourceUpdated (org_id: $org_id, filter: $filter) {
            resource {
              _id
              org_id
              cluster_id
              selfLink
              hash
              searchableData
              searchableDataHash
              created
            }
            op
          }
        }`;

        const meResult = await api.me(token);
        const unsub = subClient
          .request(query, {
            org_id: meResult.data.data.me.org_id,
            filter: 'bla2',
          })
          .subscribe({
            next: data => {
              console.log(`sub handler receives:${JSON.stringify(data)}`);
              dataReceivedFromSub = data.data.resourceUpdated.resource;
            },
            error: error => {
              console.error('subscription failed', error.stack);
              throw error;
            },
          });

        // sleep 0.1 second and send a resourceChanged event
        await sleep(200);
        aResource.org_id = org_02._id;
        // const result = await api.resourceChanged({r: aResource});
        resourceChangedFunc(aResource);
        // expect(result.data.data.resourceChanged._id).to.equal('some_fake_id');

        // sleep another 0.1 second and verify if sub received the event
        await sleep(800);
        expect(dataReceivedFromSub._id).to.equal('some_fake_id');

        // sleep 0.1 second and send a resourceChanged event
        await sleep(100);
        // const result1 = await api.resourceChanged({r: anotherResource});
        resourceChangedFunc(anotherResource);
        // expect(result1.data.data.resourceChanged._id).to.equal('anther_fake_id');

        await unsub.unsubscribe();

        await sleep(100);

        await subClient.close();

      } catch (error) {
        console.error('error response is ', error.response);
        throw error;
      }
    });
  });
});
