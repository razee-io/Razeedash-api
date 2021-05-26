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
const { RedisPubSub } = require('graphql-redis-subscriptions');
const ObjectId = require('mongoose').Types.ObjectId;
var Redis = require('ioredis-mock');
const _ = require('lodash');

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
const { GraphqlPubSub } = require('../subscription');

let mongoServer;
let myApollo;
const graphqlPort = 18004;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const subscriptionUrl = `ws://localhost:${graphqlPort}/graphql`;
const api = apiFunc(graphqlUrl);
const pubSub = GraphqlPubSub.getInstance();

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

let resourceObjId = new ObjectId('aaaabbbbccccddddeeeeffff');

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

const createClusters = async () => {
  await models.Cluster.create({
    org_id: shouldNotMatchAny._id,
    cluster_id: 'any_cluster_01',
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
    org_id:  org_01._id,
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
  await models.Cluster.create({
    org_id:  org_01._id,
    cluster_id: 'cluster_03',
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
    org_id:  org_02._id,
    cluster_id: 'cluster_04',
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
};
const createSubscriptions = async () => {
  await models.Group.create({
    _id: 'fake_g1_id',
    org_id: org_01._id,
    name: 'g1',
    uuid: 'g1-uuid',
  });
  await models.Group.create({
    _id: 'fake_g2_id',
    org_id: org_01._id,
    name: 'g2',
    uuid: 'g2-uuid',
  });
  await models.Subscription.create({
    _id: 'fake_sub_id',
    org_id: org_01._id,
    name: 'fake_abc-123-name',
    uuid: 'abc-123',
    groups: ['g1','g2'],
    channel_uuid: 'fake-channel-uuid-123',
    version_uuid: 'fake-version-uuid-123',
  });
};
const createResources = async () => {
  await models.Resource.create({
    _id: new ObjectId('aaaabbbbcccc'),
    org_id: shouldNotMatchAny._id,
    cluster_id: 'any_cluster_01',
    selfLink: 'any_selfLink',
    hash: 'any_hash',
    deleted: false,
    data: {metadata: {type: 'embedded'}, data: 'any_data' },
    searchableData: { key01: 'any value 01', key02: 'any value 02' },
    searchableDataHash: 'some random hash.',
  });
  await models.Resource.create({
    _id: resourceObjId,
    org_id: org_01._id,
    cluster_id: 'cluster_01',
    selfLink: '/mybla/selfLink',
    hash: 'any_hash',
    deleted: false,
    data: {metadata: {type: 'embedded'}, data: 'any_data' },
    searchableData: { key01: 'any value 01', key02: 'any value 02', subscription_id: 'abc-123' },
    searchableDataHash: 'some random hash.',
  });

  await models.Resource.create({
    _id: new ObjectId('aaaabbbbccc2'),
    org_id: org_02._id,
    cluster_id: 'cluster_04',
    selfLink: '/mybla/cluster04/selfLink1',
    hash: 'any_hash',
    deleted: false,
    data: {metadata: {type: 'embedded'}, data: 'any_data' },
    updated: new Date(1400000000000),
    searchableData: { key01: 'any value 01', key02: 'any value 02', subscription_id: 'abc-123', kind: 'Deployment', },
    searchableDataHash: 'some random hash.',
  });
  await models.Resource.create({
    _id: new ObjectId('aaaabbbbccc3'),
    org_id: org_02._id,
    cluster_id: 'cluster_04',
    selfLink: '/mybla/cluster04/selfLink2',
    hash: 'any_hash',
    deleted: false,
    data: {metadata: {type: 'embedded'}, data: 'any_data' },
    updated: new Date(1500000000000),
    searchableData: { key01: 'any value 01', key02: 'any value 02', subscription_id: 'abc-123', kind: 'StatefulSet' },
    searchableDataHash: 'some random hash.',
  });
  await models.Resource.create({
    _id: new ObjectId('aaaabbbbccc4'),
    org_id: org_01._id,
    cluster_id: 'cluster_03',
    selfLink: '/mybla/selfLink/deleted',
    hash: 'any_hash',
    deleted: true,
    data: {metadata: {type: 'embedded'}, data: 'any_data' },
    searchableData: { key01: 'any value 01', key02: 'any value 02' },
    searchableDataHash: 'some random hash.',
  });
  await models.ResourceYamlHist.create({
    _id: 'resourceYamlHist_01',
    org_id: org_01._id,
    cluster_id: 'cluster_01',
    resourceSelfLink: '/mybla/selfLink',
    yamlStr: { metadata: {type: 'embedded'}, data: 'YAML_HIST_DATA_01' },
    updated: new Date(),
  });
  await models.ResourceYamlHist.create({
    _id: 'resourceYamlHist_02',
    org_id: org_01._id,
    cluster_id: 'cluster_01',
    resourceSelfLink: '/mybla/selfLink',
    yamlStr: { metadata: {type: 'embedded'}, data: 'YAML_HIST_DATA_02' },
    updated: new Date(),
  });
};

const getPresetOrgs = async () => {
  presetOrgs = await models.Organization.find();
  presetOrgs = presetOrgs.map(user => {
    return user.toJSON({ virtuals: true });
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
    return resource.toJSON({ virtuals: true });
  });
  console.log(`presetResources=${JSON.stringify(presetResources)}`);
};

const mockRedis = async () => {
  pubSub.enabled = true;
  const sub = new Redis();
  const pub = sub.createConnectedClient();
  pubSub.pubSub = new RedisPubSub({
    publisher: pub,
    subscriber: sub,
  });
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

    await models.Resource.createIndexes();
    await createOrganizations();
    await createUsers();
    await createClusters();
    await createSubscriptions();
    await createResources();

    await getPresetOrgs();
    await getPresetUsers();
    await getPresetResources();
    mockRedis();
    //setTimeout(function() {
    //  why(); // logs out active handles that are keeping node running
    //}, 5000);
  });

  after(async () => {
    await myApollo.stop(myApollo);
    GraphqlPubSub.deleteInstance();
    await mongoServer.stop();
  });

  describe('resource(orgId: String!, id: String!): Resource', () => {
    let token;

    it('a user should see a resource by given id', async () => {
      try {
        token = await signInUser(models, api, user01Data);

        const meResult = await api.me(token);

        const result1 = await api.resources(token, {
          orgId: meResult.data.data.me.orgId,
          filter: 'mybla',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resources.resources[0].selfLink).to.equal(
          '/mybla/selfLink',
        );
        expect(result1.data.data.resources.resources[0].cluster.clusterId).to.equal('cluster_01');
        expect(result1.data.data.resources.resources[0].cluster.name).to.equal('cluster_01');

        const { id } = result1.data.data.resources.resources[0];
        const result2 = await api.resource(token, { orgId: meResult.data.data.me.orgId, id: id.toString() });
        console.log(JSON.stringify(result2.data));
        expect(result2.data.data.resource.id).to.equal(id);
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

    it('should sort based on the users input', async()=>{
      try {
        token = await signInUser(models, api, user02Data);

        const meResult = await api.me(token);

        const result1 = await api.resources(token, {
          orgId: meResult.data.data.me.orgId,
          filter: 'mybla',
          sort: [{ field: 'selfLink', desc: true }],
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resources.resources[0].selfLink).to.equal(
          '/mybla/cluster04/selfLink2',
        );
        const result2 = await api.resources(token, {
          orgId: meResult.data.data.me.orgId,
          filter: 'mybla',
          sort: [{ field: 'selfLink' }],
        });
        console.log(JSON.stringify(result1.data));
        expect(result2.data.data.resources.resources[0].selfLink).to.equal(
          '/mybla/cluster04/selfLink1',
        );
      } catch (error) {
        // console.error('error response is ', error.response);
        console.error(
          'error response is ',
          JSON.stringify(error.response.data),
        );
      }
    });

    it('should filter based on input kinds', async()=>{
      try {
        token = await signInUser(models, api, user02Data);

        const meResult = await api.me(token);

        const result1 = await api.resources(token, {
          orgId: meResult.data.data.me.orgId,
          kinds: ['Deployment'],
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resources.resources[0].searchableData.kind).to.equal(
          'Deployment',
        );
        expect(result1.data.data.resources.count).to.equal(
          1,
        );
        const result2 = await api.resources(token, {
          orgId: meResult.data.data.me.orgId,
          kinds: ['StatefulSet'],
        });
        console.log(JSON.stringify(result2.data));
        expect(result2.data.data.resources.resources[0].searchableData.kind).to.equal(
          'StatefulSet',
        );
        expect(result2.data.data.resources.count).to.equal(
          1,
        );
      } catch (error) {
        console.error('error response is ', error.response);
        console.error(
          'error response is ',
          JSON.stringify(error.response.data),
        );
      }
    });

    it('should see resource history item', async()=>{
      try{
        token = await signInUser(models, api, user01Data);

        const meResult = await api.me(token);


        const result1 = await api.resourceHistId(token, {
          id: resourceObjId,
          orgId: meResult.data.data.me.orgId,
          filter: 'mybla',
          histId: 'resourceYamlHist_01',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resource.data).to.equal(
          'YAML_HIST_DATA_01',
        );
      }catch(error){
        console.error(
          'error response is ',
          JSON.stringify(error.response.data),
        );
        throw error;
      }
    });
  });

  describe('resourceHistory(orgId: String!, clusterId: String!, resourceSelfLink: String!, beforeDate: Date, afterDate: Date, limit: Int = 20)', ()=>{
    it('should view history list for a resource', async()=>{
      let token;
      try {
        token = await signInUser(models, api, user01Data);


        const meResult = await api.me(token);

        const result1 = await api.resourceHistory(token, {
          orgId: meResult.data.data.me.orgId,
          clusterId: 'cluster_01',
          resourceSelfLink: '/mybla/selfLink',
          beforeDate: null,
          afterDate: null,
          limit: 20,
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourceHistory.count).to.equal(
          2
        );
        var ids = _.map(result1.data.data.resourceHistory.items, 'id');
        expect(ids.length).to.equal(
          2
        );
        expect(ids).to.have.members(['resourceYamlHist_01', 'resourceYamlHist_02']);
      } catch (error) {
        console.error('error response is ', error.response);
        throw error;
      }
    });
  });

  describe('resourceByKeys(orgId: String! clusterId: String! selfLink: String!): Resource', () => {
    let token;

    it('a user should see a resource by given orgId, clusterId, and selfLink', async () => {
      try {

        token = await signInUser(models, api, user01Data);


        const meResult = await api.me(token);

        const result1 = await api.resourceByKeys(token, {
          orgId: meResult.data.data.me.orgId,
          clusterId: 'cluster_01',
          selfLink: '/mybla/selfLink',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourceByKeys.clusterId).to.equal(
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


        const meResult = await api.me(token);
        const result1 = await api.resourcesCount(token, {
          orgId: meResult.data.data.me.orgId,
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


        const meResult = await api.me(token);

        const result1 = await api.resources(token, {
          orgId: meResult.data.data.me.orgId,
          filter: 'mybla',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resources.resources[0].selfLink).to.equal(
          '/mybla/selfLink',
        );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourcesByCluster(clusterId: String! filter: String): [Resource!]', () => {
    let token;

    it('a user should only see resources for given clusterId with optional filter', async () => {
      try {
        token = await signInUser(models, api, user01Data);


        const meResult = await api.me(token);

        const result1 = await api.resourcesByCluster(token, {
          orgId: meResult.data.data.me.orgId,
          clusterId: 'cluster_01',
          filter: 'selfLink',
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourcesByCluster.resources[0].clusterId).to.equal(
          'cluster_01',
        );
        expect(result1.data.data.resourcesByCluster.resources[0].selfLink).to.equal(
          '/mybla/selfLink',
        );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });

  describe('resourcesBySubscription(orgId: String! filter: String): ResourcesList!', () => {
    let token;

    it('a user should only see resources for given subscription id', async () => {
      try {
        token = await signInUser(models, api, user01Data);


        const meResult = await api.me(token);

        const result1 = await api.resourcesBySubscription(token, {
          orgId: meResult.data.data.me.orgId,
          subscriptionId: 'abc-123'
        });
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.resourcesBySubscription.resources[0].clusterId).to.equal(
          'cluster_01',
        );
        expect(result1.data.data.resourcesBySubscription.resources[0].searchableData.subscription_id).to.equal(
          'abc-123',
        );

      } catch (error) {
        console.error('error response is ', error.response);
        throw error;
      }
    });
  });

  describe('resourceUpdated (orgId: String!, filter: String): ResourceUpdated!', () => {
    before(function() {
      if (pubSub.enabled === false) {
        // this.skip();
      }
    });

    let token;

    const aResource = {
      id: 'some_fake_id',
      orgId: 'org_01',
      clusterId: 'cluster_01',
      selfLink: '/ff/bla2',
      searchableData: { ttt: 'tt tt t1' },
    };

    const anotherResource = {
      id: 'anther_fake_id',
      orgId: 'org_02',
      clusterId: 'cluster_01',
      selfLink: '/ff/bla2',
      searchableData: { ttt: 'tt tt t1' },
    };

    it('a user subscribe an org and filter should be able to get notification is a new/updated resource matches', async () => {
      try {
        let dataReceivedFromSub;

        token = await signInUser(models, api, user02Data);


        const subClient = new SubClient({
          wsUrl: subscriptionUrl,
          token,
        });
        const query = `subscription ($orgId: String!, $filter: String) {
          resourceUpdated (orgId: $orgId, filter: $filter) {
            resource {
              id
              orgId
              clusterId
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
            orgId: meResult.data.data.me.orgId,
            filter: 'bla2',
          })
          .subscribe({
            next: data => {
              dataReceivedFromSub = data.data.resourceUpdated.resource;
            },
            error: error => {
              console.error('subscription failed', error.stack);
              throw error;
            },
          });

        // sleep 0.1 second and send a resourceChanged event
        await sleep(200);
        aResource.orgId = org_02._id;
        // const result = await api.resourceChanged({r: aResource});
        pubSub.resourceChangedFunc(aResource);
        // expect(result.data.data.resourceChanged._id).to.equal('some_fake_id');

        // sleep another 0.1 second and verify if sub received the event
        await sleep(800);
        expect(dataReceivedFromSub.id).to.equal('some_fake_id');

        // sleep 0.1 second and send a resourceChanged event
        await sleep(100);
        // const result1 = await api.resourceChanged({r: anotherResource});
        pubSub.resourceChangedFunc(anotherResource);
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
