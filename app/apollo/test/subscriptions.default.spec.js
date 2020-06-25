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
const subscriptionsFunc = require('./subscriptionsApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { GraphqlPubSub } = require('../subscription');

const { prepareOrganization } = require(`./testHelper.${AUTH_MODEL}`); 
let mongoServer;
let myApollo;
const graphqlPort = 18000;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const subscriptionsApi = subscriptionsFunc(graphqlUrl);
let token;
let orgKey;

let org01Data;
let org01;

const channel_01_name = 'fake_channel_01';
const channel_01_uuid = 'fake_ch_01_uuid';

const sub_01_name = 'fake_sub_01';
const sub_01_uuid = 'fake_sub_01_uuid';
const sub_01_version = '0.0.1';
const sub_01_version_uuid = 'fake_sub_01_verison_uuid';
const sub_01_tags = 'dev';

const sub_02_name = 'fake_sub_02';
const sub_02_uuid = 'fake_sub_02_uuid';
const sub_02_version = '0.0.1';
const sub_02_version_uuid = 'fake_sub_02_verison_uuid';
const sub_02_tags = 'prod';

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
};
  
const createChannels = async () => {
  await models.Channel.create({
    _id: 'fake_ch_id_1',
    org_id: org01._id,
    uuid: channel_01_uuid,
    name: channel_01_name,
    versions: [
      {
        uuid: sub_01_version_uuid,
        name: sub_01_version,
        description: 'test01',
        location: 'mongo'
      },
      {
        uuid: sub_02_version_uuid,
        name: sub_02_version,
        description: 'test02',
        location: 'mongo'
      }
    ]
  });

};

const createSubscriptions = async () => {
  await models.Subscription.create({
    _id: 'fake_sub_id_1',
    org_id: org01._id,
    name: sub_01_name,
    uuid: sub_01_uuid,
    tags: sub_01_tags,
    channel_uuid: channel_01_uuid,
    channel_name: channel_01_name,
    version: sub_01_version,
    version_uuid: sub_01_version_uuid,
    owner: 'tester'
  });

  await models.Subscription.create({
    _id: 'fake_sub_id_2',
    org_id: org01._id,
    name: sub_02_name,
    uuid: sub_02_uuid,
    tags: sub_02_tags,
    channel_uuid: channel_01_uuid,
    channel_name: channel_01_name,
    version: sub_02_version,
    version_uuid: sub_02_version_uuid,
    owner: 'tester'
  });
};

const getOrgKey = async () => {
  const presetOrgs = await models.Organization.find();
  return presetOrgs[0].orgKeys[0];
};

describe('subscriptions graphql test suite', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer();
    const mongoUrl = await mongoServer.getConnectionString();
    console.log(`    cluster.js in memory test mongodb url is ${mongoUrl}`);
  
    myApollo = await apollo({ mongo_url: mongoUrl, graphql_port: graphqlPort, });
  
    await createOrganizations();
    await createChannels();
    await createSubscriptions();
    orgKey = await getOrgKey();
  }); // before
  
  after(async () => {
    await myApollo.stop(myApollo);
    GraphqlPubSub.deleteInstance();
    await mongoServer.stop();
  }); // after

  it('get should return a subscription with a matching tag', async () => {
    try {
      const {
        data: {
          data: { subscriptionsByTag },
        },
      } = await subscriptionsApi.subscriptionsByTag(token, {
        tags: sub_01_tags
      }, orgKey);

      expect(subscriptionsByTag).to.have.length(1);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get should return an empty array when there are no matching tags', async () => {
    try {
      const {
        data: {
          data: { subscriptionsByTag },
        },
      } = await subscriptionsApi.subscriptionsByTag(token, {
        tags: '' 
      }, orgKey);
      expect(subscriptionsByTag).to.have.length(0);
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
