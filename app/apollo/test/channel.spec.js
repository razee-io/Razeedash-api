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
const resourceFunc = require('./api');
const channelFunc = require('./channelApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
const { prepareUser, prepareOrganization, signInUser } = require(`./testHelper.${AUTH_MODEL}`);

let mongoServer;
let myApollo;

const graphqlPort = 18000;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const resourceApi = resourceFunc(graphqlUrl);
const channelApi = channelFunc(graphqlUrl);
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

const channel_01_name = 'fake_channel_01';
const channel_01_uuid = 'fake_ch_01_uuid';

const channel_02_name = 'fake_channel_02';
const channel_02_uuid = 'fake_ch_02_uuid';

const channel_03_name = 'fake_channel_03';
const channel_03_uuid = 'fake_ch_03_uuid';

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
  
const createChannels = async () => {
  await models.Channel.create({
    _id: 'fake_ch_id_1',
    org_id: org01._id,
    uuid: channel_01_uuid,
    name: channel_01_name,
    versions: []
  });

  await models.Channel.create({
    _id: 'fake_id_2',
    org_id: org01._id,
    uuid: channel_02_uuid,
    name: channel_02_name,
    versions: []
  });

  await models.Channel.create({
    _id: 'fake_id_3',
    org_id: org77._id,
    uuid: channel_03_uuid,
    name: channel_03_name,
    versions: []
  });
};

describe('channel graphql test suite', () => {
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
    await createChannels();
  
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

  it('get channels', async () => {
    try {
      const {
        data: {
          data: { channels },
        },
      } = await channelApi.channels(token, {
        org_id: org01._id,
        uuid: channel_01_uuid,
      });
    
      expect(channels).to.have.length(2);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get channel by channel uuid', async () => {
    try {
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(token, {
        org_id: org01._id,
        uuid: channel_01_uuid,
      });
    
      expect(channel.name).to.equal(channel_01_name);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a channel', async () => {
    try {
      const {
        data: {
          data: { addChannel },
        },
      } = await channelApi.addChannel(adminToken, {
        org_id: org01._id,
        name: 'a_random_name',
      });
    
      expect(addChannel.uuid).to.be.an('string');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add and get channel version ', async () => {
    try {
      // step 1: add a channel version by admin token
      const {
        data: {
          data: { addChannelVersion },
        },
      } = await channelApi.addChannelVersion(adminToken, {
        org_id: org01._id,
        channel_uuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.1`,
        type: 'json',
        content: '{"n0": 123.45}',
        description: `${channel_01_name}:v.0.1`
      });
      
      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.version_uuid).to.be.an('string');

      // step 2: add another channel version by admin token
      const {
        data: {
          data: { addChannelVersion : addChannelVersion2 },
        },
      } = await channelApi.addChannelVersion(adminToken, {
        org_id: org01._id,
        channel_uuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.2`,
        type: 'json',
        content: '{"n0": 456.78}',
        description: `${channel_01_name}:v.0.2`
      });
    
      expect(addChannelVersion2.success).to.equal(true);
      expect(addChannelVersion2.version_uuid).to.be.an('string');

      // step 3: get a channel version by user1 token
      const {
        data: {
          data: { getChannelVersion },
        },
      } = await channelApi.getChannelVersion(token, {
        org_id: org01._id,
        channel_uuid: channel_01_uuid,
        version_uuid: addChannelVersion.version_uuid,
      });      

      expect(getChannelVersion.channel_name).to.equal(channel_01_name);
      expect(getChannelVersion.name).to.equal(`${channel_01_name}:v.0.1`);
      expect(getChannelVersion.content).to.equal('{"n0": 123.45}');
      expect(getChannelVersion.created).to.be.an('string');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('edit and remove channel', async () => {
    try {

      //step 1: edit channel 02's name
      const {
        data: {
          data: { editChannel },
        },
      } = await channelApi.editChannel(adminToken, {
        org_id: org01._id,
        uuid: channel_02_uuid,
        name: `${channel_02_name}_new`
      });
    
      expect(editChannel.success).to.equal(true);
      expect(editChannel.name).to.equal(`${channel_02_name}_new`);

      //step 1.1: edit channel 02's name
      const {
        data: {
          data
        },
      } = await channelApi.editChannel(adminToken, {
        org_id: org01._id,
        uuid: 'not_exit_uuid',
        name: `${channel_02_name}_new`
      });
    
      expect(data).to.equal(null);

      // step 2 remove the channel
      const {
        data: {
          data: { removeChannel },
        },
      } = await channelApi.removeChannel(adminToken, {
        org_id: org01._id,
        uuid: channel_02_uuid,
      });

      expect(removeChannel.success).to.equal(true);
      expect(removeChannel.uuid).to.equal(channel_02_uuid);

      // step 3 validate the channel 02 is not there
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(adminToken, {
        org_id: org01._id,
        uuid: channel_02_uuid,
      });

      expect(channel).to.equal(null);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });
  it('remove configuration version, channel has multiple versions ', async () => {
    try {
      // step 1.1: add a channel version by admin token
      // console.log('here step 1 in remove channel version');
      const {
        data: {
          data: { addChannelVersion },
        },
      } = await channelApi.addChannelVersion(adminToken, {
        org_id: org01._id,
        channel_uuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.4`,
        type: 'json',
        content: '{"n0": 123.45}',
        description: `${channel_01_name}:v.0.4`
      });
      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.version_uuid).to.be.an('string');
      // step 2: remove the channel version by an adminToken
      // console.log('here step 2 in remove channel version');
      const {
        data: {
          data: { getChannelVersion },
        },
      } = await channelApi.getChannelVersion(token, {
        org_id: org01._id,
        channel_uuid: channel_01_uuid,
        version_uuid: addChannelVersion.version_uuid,
      }); 
      expect(getChannelVersion.name).to.equal(`${channel_01_name}:v.0.4`);
      expect(getChannelVersion.content).to.equal('{"n0": 123.45}');
      expect(getChannelVersion.created).to.be.an('string');
      const {
        data: {
          data: { removeChannelVersion },
        },
      } = await channelApi.removeChannelVersion(adminToken, {
        org_id: org01._id,
        uuid: getChannelVersion.uuid,
      });
      expect(removeChannelVersion.success).to.equal(true);
      expect(removeChannelVersion.uuid).to.equal(getChannelVersion.uuid);
      // step 3 validate the channel version is not there
      // console.log('here step 3 in remove channel version');
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(token, {
        org_id: org01._id,
        uuid: channel_01_uuid,
      });  
      console.log(`channel read = ${JSON.stringify(channel.versions)}`);
      expect(channel.versions.length).to.equal(2);  
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