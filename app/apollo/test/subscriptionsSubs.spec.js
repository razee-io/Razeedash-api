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

// const subscriptionsFunc = require('./subscriptionsApi');

const { 
  prepareUser, 
  prepareOrganization, 
  signInUser 
} = require(`./testHelper.${AUTH_MODEL}`);

const SubClient = require('./subClient');
const { channelSubChangedFunc, pubSubPlaceHolder } = require('../subscription');

let mongoServer;
let myApollo;
const graphqlPort = 18009;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const subscriptionUrl = `ws://localhost:${graphqlPort}/graphql`;
const api = apiFunc(graphqlUrl);
// const subscriptionsApi = subscriptionsFunc(graphqlUrl);

// let token;
let adminToken;
let orgKey;

let org01Data;
let org77Data;
let org01;
// let org77;

let user01Data;
let user77Data;
let userRootData;

let presetOrgs;
let presetUsers;
let presetClusters;
let presetSubs;

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

// eslint-disable-next-line no-unused-vars
const getPresetSubs= async () => {
  presetSubs = await models.Subscription.find();
  presetSubs = presetSubs.map(sub=> {
    return sub.toJSON();
  });
  console.log(`presetSubs=${JSON.stringify(presetSubs)}`);
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
    channel: channel_01_name,
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
    channel: channel_01_name,
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
  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer();
    const mongoUrl = await mongoServer.getConnectionString();
    console.log(`subscriptionSubs.spec.js in memory test mongodb url is ${mongoUrl}`);
    myApollo = await apollo({ mongo_url: mongoUrl, graphql_port: graphqlPort, });
  
    await createOrganizations();
    await createUsers();
    await createChannels();
    await createSubscriptions();
  
    // Can be uncommented if you want to see the test data that was added to the DB
    // await getPresetOrgs();
    // await getPresetUsers();
    // await getPresetClusters();
    // await getPresetSubs();
  
    token = await signInUser(models, api, user01Data);
    adminToken = await signInUser(models, api, userRootData);
    orgKey = await getOrgKey();
  }); // before
  
  after(async () => {
    await myApollo.stop(myApollo);
    if (pubSubPlaceHolder.enabled) {
      await pubSubPlaceHolder.pubSub.close();
    }
    await mongoServer.stop();
  }); 

  describe('subscriptionUpdated(org_id: String!): SubscriptionUpdated!', () => {
    // process.env.REDIS_PUBSUB_URL = 'redis://127.0.0.1:6379/1';
    before(function() {
      if (pubSubPlaceHolder.enabled === false) {
        this.skip();
      } else {
        pubSubPlaceHolder.pubSub.close();
      }
    });

    it('A subscribed client should receive an update when a razee subscription has changed', async () => {
      try {
         
        if (pubSubPlaceHolder.enabled === false) {
          return this.skip();
        }
        let dataReceivedFromSub;
        
        const subClient = new SubClient({
          wsUrl: subscriptionUrl,
          adminToken,
          orgKey
        });
        
        const query = `subscription ($org_id: String!) {
            subscriptionUpdated (org_id: $org_id) {
              has_updates
            }
          }`;

        const unsub = subClient
          .request(query, {
            org_id: org01._id,
          })
          .subscribe({
            next: data => {
              dataReceivedFromSub = data.data.subscriptionUpdated.has_updates;
            },
            error: error => {
              console.error('subscription failed', error.stack);
              throw error;
            },
          });
    
        await sleep(1200);
        await channelSubChangedFunc({org_id: org01._id});
        await sleep(1800);
        expect(dataReceivedFromSub).to.be.true;
        await unsub.unsubscribe();
        await sleep(1200);
        await subClient.close();
      } catch (error) {
        console.log(error);
        console.error('error response is ', error.response);
        throw error;
      }
    });

  });

 

});
