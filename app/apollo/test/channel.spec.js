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

// If external auth model specified, use it.  Else use built-in auth model.
const externalAuth = require('../../externalAuth.js');
const testHelperPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testPath : `./testHelper.${AUTH_MODEL}`;
const { prepareUser, prepareOrganization, signInUser } = require(testHelperPath);
const testDataPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testDataPath : `./app/apollo/test/data/${AUTH_MODEL}`;

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
const channel_01_custom = {
  'testkey1': 'testval1',
  'testkey2': 'testval2'
};

const channel_02_name = 'fake_channel_02';
const channel_02_uuid = 'fake_ch_02_uuid';
const channel_02_tags = ['tag_01', 'tag_02'];
const channel_02_custom = { 'keyA': 'valA' };

const channel_03_name = 'fake_channel_03';
const channel_03_uuid = 'fake_ch_03_uuid';
const channel_03_custom = {
  'key_with_null_val': null,
  'keyB': 'valB',
};

const channel_04_name = 'fake_channel_04';
const channel_04_uuid = 'fake_ch_04_uuid';
const channel_04_custom = {
  'keyC': 'valC',
  'keyD': 'valD',
  'keyE': 'valE',
};

const channelVersion_01_name = 'fake_channelVersion_01';
const channelVersion_01_uuid = 'fake_cv_01_uuid';

const subscription_01_name = 'fake_subscription_01';
const subscription_01_uuid = 'fake_sub_01_uuid';

const serviceSubscription_01_name = 'fake_serviceSubscription_01';
const serviceSubscription_01_uuid = 'fake_servsub_01_uuid';

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
  org77Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_77.json`,
      'utf8',
    ),
  );
  org77 = await prepareOrganization(models, org77Data);
};

const createUsers = async () => {
  user01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.user01.json`,
      'utf8',
    ),
  );
  await prepareUser(models, user01Data);
  user77Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.user77.json`,
      'utf8',
    ),
  );
  await prepareUser(models, user77Data);
  userRootData = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.root.json`,
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
    versions: [],
    custom: channel_01_custom
  });

  await models.Channel.create({
    _id: 'fake_id_2',
    org_id: org01._id,
    uuid: channel_02_uuid,
    name: channel_02_name,
    versions: [],
    tags: channel_02_tags,
    custom: channel_02_custom
  });

  await models.Channel.create({
    _id: 'fake_id_3',
    org_id: org77._id,
    uuid: channel_03_uuid,
    name: channel_03_name,
    versions: [],
    custom: channel_03_custom
  });
  await models.Channel.create({
    _id: 'fake_id_4',
    org_id: org01._id,
    uuid: channel_04_uuid,
    name: channel_04_name,
    custom: channel_04_custom,
    versions: [
      {
        uuid: channelVersion_01_uuid,
        name: channelVersion_01_name,
        description: channelVersion_01_name + ' description',
        location: 's3', /*location is no longer used, but may still be present in existing data such as this*/
      },
    ]
  });
};

const createVersions = async () => {
  await models.DeployableVersion.create({
    _id: 'fake_ver_1',
    org_id: org01._id,
    uuid: channelVersion_01_uuid,
    channel_id: channel_04_uuid,
    channel_name: channel_04_name,
    name: channelVersion_01_name,
    description: channelVersion_01_name + ' description',
    content: {
      metadata: {
        type: 'embedded',
      },
      data: 'U2FsdGVkX1/u/AiVrC+WKmt3d2+I7N+Y08bfnQ36SH0=',
    },
    type: 'application/yaml',
    ownerId: 'abc',
  });
};

const createSubscriptions = async () => {
  await models.Subscription.create({
    _id: 'fake_id_1',
    org_id: org01._id,
    uuid: subscription_01_uuid,
    name: subscription_01_name,
    owner: 'abc',
    groups: ['dev'],
    channel_uuid: channel_04_uuid,
    channel: channel_04_name,
    version: channelVersion_01_name,
    version_uuid: channelVersion_01_uuid,
  });
};

const createServiceSubscriptions = async () => {
  await models.ServiceSubscription.create({
    _id: 'fake_ss_id_1',
    org_id: org01._id,
    uuid: serviceSubscription_01_uuid,
    name: serviceSubscription_01_name,
    owner: 'abc',
    groups: ['dev'],
    channel_uuid: channel_04_uuid,
    channelName: channel_04_name,
    version: channelVersion_01_name,
    version_uuid: channelVersion_01_uuid,
  });
};

const createGroups = async () => {
  await models.Group.create({
    _id: 'dummyuuid',
    org_id: org01._id,
    uuid: 'group_dev_uuid',
    name: 'dev',
  });
};

describe('channel graphql test suite', () => {
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
    await createChannels();
    await createVersions();
    await createSubscriptions();
    await createServiceSubscriptions();
    await createGroups();

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

  it('get channels', async () => {
    try {
      const {
        data: {
          data: { channels },
        },
      } = await channelApi.channels(token, {
        orgId: org01._id,
        uuid: channel_01_uuid,
      });

      expect(channels).to.have.length(3);
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
        orgId: org01._id,
        uuid: channel_01_uuid,
      });

      expect(channel.name).to.equal(channel_01_name);
      expect(channel.custom).to.be.deep.equal(channel_01_custom);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get channel by channel name', async () => {
    try {
      const {
        data: {
          data: { channelByName },
        },
      } = await channelApi.channelByName(token, {
        orgId: org01._id,
        name: channel_01_name,
      });

      expect(channelByName.uuid).to.equal(channel_01_uuid);
      expect(channelByName.custom).to.be.deep.equal(channel_01_custom);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get channel by channel tags', async () => {
    try {
      const {
        data: {
          data: { channelsByTags },
        },
      } = await channelApi.channelsByTags(token, {
        orgId: org01._id,
        tags: channel_02_tags,
      });
      console.log(`channelsByTags:${JSON.stringify( channelsByTags, null, 2 )}`);

      expect(channelsByTags.length).to.equal(1);
      expect(channelsByTags[0].uuid).to.equal(channel_02_uuid);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get channel by one channel tag', async () => {
    try {
      const {
        data: {
          data: { channelsByTags },
        },
      } = await channelApi.channelsByTags(token, {
        orgId: org01._id,
        tags: [channel_02_tags[0]],
      });
      console.log(`channelsByTags:${JSON.stringify( channelsByTags, null, 2 )}`);

      expect(channelsByTags.length).to.equal(1);
      expect(channelsByTags[0].uuid).to.equal(channel_02_uuid);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get channel by channel name with subscriptions and versions', async () => {
    try {
      const {
        data: {
          data: { channelByName },
        },
      } = await channelApi.channelByName(token, {
        orgId: org01._id,
        name: channel_04_name,
      });

      expect(channelByName.subscriptions.length).to.equal(1);
      expect(channelByName.subscriptions[0].versionUuid).to.equal(channelByName.subscriptions[0].versionObj.uuid);

      expect(channelByName.serviceSubscriptions.length).to.equal(1);
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
      const custom_dat = {
        'random_key_a':  'random_val_a',
        'random_key_B':  'random_val_B'
      };

      const {
        data: {
          data: { addChannel },
        },
      } = await channelApi.addChannel(adminToken, {
        orgId: org01._id,
        name: 'a_random_name-allowedchars-hypen_underscore.dot',
        data_location: 'dal',
        custom: custom_dat
      });

      expect(addChannel.uuid).to.be.an('string');

      const channel1 = await models.Channel.findOne({uuid: addChannel.uuid});
      expect(channel1.data_location).to.equal('dal');

      expect(Object.fromEntries(channel1.custom)).to.be.deep.equal(custom_dat);

      const addChannel2 = await channelApi.addChannel(adminToken, {
        orgId: org01._id,
        name: 'a_random_name2',
      });
      expect(addChannel2.data.errors[0].message).to.equal(`Too many configuration channels are registered under ${org01._id}.`);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a channel with illegal characters', async () => {
    try {
      const data = await channelApi.addChannel(adminToken, {
        orgId: org01._id,
        name: 'a_illegal_char#',
      });
      console.log(`${JSON.stringify(data.data)}`);
      expect(data.data.errors[0].message).to.have.string('should avoid leading or trailing whitespace and only contain alphabets, numbers, and these additional characters');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a channel with illegal whitespace', async () => {
    try {
      const data = await channelApi.addChannel(adminToken, {
        orgId: org01._id,
        name: ' a_illegal_pad ',
      });
      console.log(`${JSON.stringify(data.data)}`);
      expect(data.data.errors[0].message).to.have.string('should avoid leading or trailing whitespace and only contain alphabets, numbers, and these additional characters');
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
      const result = await channelApi.addChannelVersion(adminToken, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.1`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${channel_01_name}:v.0.1`
      });
      console.log( `addChannelVersion result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannelVersion = result.data.data.addChannelVersion;

      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // step 2: add another channel version by admin token
      const {
        data: {
          data: { addChannelVersion : addChannelVersion2 },
        },
      } = await channelApi.addChannelVersion(adminToken, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.2`,
        type: 'yaml',
        content: '{"n0": 456.78}',
        description: `${channel_01_name}:v.0.2`
      });

      expect(addChannelVersion2.success).to.equal(true);
      expect(addChannelVersion2.versionUuid).to.be.an('string');

      // step 3: get a channel version by user1 token
      const {
        data: {
          data: data,
          errors: errors
        },
      } = await channelApi.channelVersion(token, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        versionUuid: addChannelVersion.versionUuid,
      });

      if (errors) {
        expect.fail(errors[0].message);
      }

      const channelVersion = data.channelVersion;

      expect(channelVersion.channelName).to.equal(channel_01_name);
      expect(channelVersion.name).to.equal(`${channel_01_name}:v.0.1`);
      expect(channelVersion.content).to.equal('{"n0": 123.45}');
      expect(channelVersion.created).to.be.an('string');

      // step 4: get a channel version by name by user1 token
      const {
        data: {
          data: { channelVersionByName },
        },
      } = await channelApi.channelVersionByName(token, {
        orgId: org01._id,
        channelName: channel_01_name,
        versionName: `${channel_01_name}:v.0.2`,
      });

      expect(channelVersionByName.channelName).to.equal(channel_01_name);
      expect(channelVersionByName.name).to.equal(`${channel_01_name}:v.0.2`);
      expect(channelVersionByName.content).to.equal('{"n0": 456.78}');
      expect(channelVersionByName.created).to.be.an('string');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add and remove channel version from a channel with another version ', async () => {
    try {
      // step 1: add a channel version by admin token
      const result = await channelApi.addChannelVersion(adminToken, {
        orgId: org01._id,
        channelUuid: channel_04_uuid,
        name: `${channel_04_name}:v.0.1`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${channel_04_name}:v.0.1`
      });
      console.log( `addChannelVersion result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannelVersion = result.data.data.addChannelVersion;

      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // step 2: delete a channel version by admin token
      const {
        data: {
          data: { removeChannelVersion },
        },
      } = await channelApi.removeChannelVersion(adminToken, {
        orgId: org01._id,
        uuid: addChannelVersion.versionUuid,
      });
      expect(removeChannelVersion.success).to.equal(true);
      expect(removeChannelVersion.uuid).to.equal(addChannelVersion.versionUuid);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('Verify user able to create channel version with malformed yaml data', async () => {
    try {

      const addChannelVersion = await channelApi.addChannelVersion(adminToken, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.3`,
        type: 'application/yaml',
        content: '!@#$%^&*',
        description: `${channel_01_name}:v.0.3`
      });

      var result = addChannelVersion.data.errors.map(error => error.message).join();
      expect(result.includes('Provided YAML content is not valid')).to.equal(true);

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

      let channel_02_custom_new = {
        'newkey': 'newval',
      };

      //step 1: edit channel 02's name and custom properties
      const result = await channelApi.editChannel(adminToken, {
        orgId: org01._id,
        uuid: channel_02_uuid,
        name: `${channel_02_name}_new`,
        custom: channel_02_custom_new
      });
      console.log( `editChannel result: ${JSON.stringify( result.data, null, 2 )}` );
      const editChannel = result.data.data.editChannel;

      expect(editChannel.success).to.equal(true);
      expect(editChannel.name).to.equal(`${channel_02_name}_new`);

      const channel1 = await models.Channel.findOne({uuid: editChannel.uuid});
      expect(Object.fromEntries(channel1.custom)).to.be.deep.equal(channel_02_custom_new);


      //step 1.1: edit channel 02's name
      const {
        data: {
          data
        },
      } = await channelApi.editChannel(adminToken, {
        orgId: org01._id,
        uuid: 'not_exit_uuid',
        name: `${channel_02_name}_new`
      });

      expect(data).to.equal(null);
      // step 2 remove the channel
      const result2 = await channelApi.removeChannel(adminToken, {
        orgId: org01._id,
        uuid: channel_02_uuid,
      });
      console.log( `removeChannel result: ${JSON.stringify( result2.data, null, 2 )}` );
      const removeChannel = result2.data.data.removeChannel;

      expect(removeChannel.success).to.equal(true);
      expect(removeChannel.uuid).to.equal(channel_02_uuid);
      // step 3 validate the channel 02 is not there
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(adminToken, {
        orgId: org01._id,
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

  it('edit channel and update channel name', async () => {
    try {

      const result = await channelApi.editChannel(adminToken, {
        orgId: org01._id,
        uuid: channel_04_uuid,
        name: `${channel_04_name}_new`
      });
      console.log( `editChannel result: ${JSON.stringify( result.data, null, 2 )}` );
      const editChannel = result.data.data.editChannel;

      expect(editChannel.success).to.equal(true);
      expect(editChannel.name).to.equal(`${channel_04_name}_new`);
      const subResult = await models.Subscription.findOne({ org_id: org01._id, channel_uuid: channel_04_uuid, });
      expect(subResult.channelName).to.equal(`${channel_04_name}_new`);
    } catch(error) {
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
      // step 1: add a channel version by admin token
      const result = await channelApi.addChannelVersion(adminToken, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.4`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${channel_01_name}:v.0.4`
      });
      console.log( `addChannelVersion result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannelVersion = result.data.data.addChannelVersion;

      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // step 2: add another channel version by admin token
      const {
        data: {
          data: { addChannelVersion : addChannelVersion4 },
        },
      } = await channelApi.addChannelVersion(adminToken, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.5`,
        type: 'yaml',
        content: '{"n0": 234.78}',
        description: `${channel_01_name}:v.0.5`
      });

      expect(addChannelVersion4.success).to.equal(true);
      expect(addChannelVersion4.versionUuid).to.be.an('string');

      // step 3: add another channel version by admin token

      const addChannelVersion5 = await channelApi.addChannelVersion(adminToken, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        name: `${channel_01_name}:v.0.6`,
        type: 'yaml',
        content: '{"n0": 1234.78}',
        description: `${channel_01_name}:v.0.6`
      });
      expect(addChannelVersion5.data.errors[0].message).to.equal(`Too many configuration channel versions are registered under ${channel_01_uuid}.`);

      // step 4: remove the channel version by an adminToken
      const {
        data: {
          data: { channelVersion },
        },
      } = await channelApi.channelVersion(token, {
        orgId: org01._id,
        channelUuid: channel_01_uuid,
        versionUuid: addChannelVersion.versionUuid,
      });
      expect(channelVersion.name).to.equal(`${channel_01_name}:v.0.4`);
      expect(channelVersion.content).to.equal('{"n0": 123.45}');
      expect(channelVersion.created).to.be.an('string');
      const {
        data: {
          data: { removeChannelVersion },
        },
      } = await channelApi.removeChannelVersion(adminToken, {
        orgId: org01._id,
        uuid: channelVersion.uuid,
      });
      expect(removeChannelVersion.success).to.equal(true);
      expect(removeChannelVersion.uuid).to.equal(channelVersion.uuid);

      // step 5 validate the channel version is not there
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(token, {
        orgId: org01._id,
        uuid: channel_01_uuid,
      });
      console.log(`channel read = ${JSON.stringify(channel, null, 2)}`);
      expect(channel.versions.length).to.equal(3);
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
