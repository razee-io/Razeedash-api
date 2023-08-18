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
const { v4: UUID } = require('uuid');
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

let fgaToken01;
let fgaToken02;

let org01Data;
let org01;

let fgaUser01Data;
let fgaUser02Data;

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
};

const createUsers = async () => {
  fgaUser01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/fga.spec.user01.json`,
      'utf8',
    ),
  );
  await prepareUser(models, fgaUser01Data);
  fgaUser02Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/fga.spec.user02.json`,
      'utf8',
    ),
  );
  await prepareUser(models, fgaUser02Data);
  return {};
};

const createChannels = async () => {
  await models.Channel.create({
    _id: 'fake_ch_id_1',
    org_id: org01._id,
    uuid: 'testConfiguration1',
    name: 'test-configuration1',
    versions: [],  /* channel versions is deprecated and no longer used */
    tags: ['tag_01'],
    contentType: 'local'
  });
  await models.Channel.create({
    _id: 'fake_ch_id_2',
    org_id: org01._id,
    uuid: 'testConfiguration2',
    name: 'test-configuration2',
    versions: [],  /* channel versions is deprecated and no longer used */
    tags: ['tag_02'],
    contentType: 'local'
  });
};

const createVersions = async () => {
  await models.DeployableVersion.create({
    _id: 'fake_ver_id_1',
    org_id: org01._id,
    uuid: 'testVersion1',
    name: 'test-version1',
    channel_id: 'testConfiguration1',
    channel_name: 'test-configuration1',
  });
  await models.DeployableVersion.create({
    _id: 'fake_ver_id_2',
    org_id: org01._id,
    uuid: 'testVersion2',
    name: 'test-version2',
    channel_id: 'testConfiguration2',
    channel_name: 'test-configuration2',
  });
};

const createGroups = async () => {
  await models.Group.create({
    _id: UUID(),
    org_id: org01._id,
    uuid: 'testGroup1',
    name: 'testGroup1',
    owner: 'undefined'
  });
  await models.Group.create({
    _id: UUID(),
    org_id: org01._id,
    uuid: 'testGroup2',
    name: 'testGroup2',
    owner: 'undefined'
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
    await createGroups();

    fgaToken01 = await signInUser(models, resourceApi, fgaUser01Data);
    fgaToken02 = await signInUser(models, resourceApi, fgaUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  // channels fgaUser01
  it('fgaUser01 has authentication to get ALLOWED channels', async () => {
    try {
      const {
        data: {
          data: { channels },
        },
      } = await channelApi.channels(fgaToken01, {
        orgId: org01._id,
      });

      expect(channels).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channels fgaUser02
  it('fgaUser02 has authentication to get ALLOWED channels', async () => {
    try {
      const result = await channelApi.channels(fgaToken02, {
        orgId: org01._id,
      });

      expect(result.data.data.channels).to.have.length(1);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channel
  it('fgaUser01 has authentication to get channel by channel uuid', async () => {
    try {
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(fgaToken01, {
        orgId: org01._id,
        uuid: 'testConfiguration1',
      });

      expect(channel.name).to.equal('test-configuration1');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channel without authentication
  it('fgaUser01 does NOT have authentication to get channel by channel uuid', async () => {
    try {
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(fgaToken01, {
        orgId: org01._id,
        uuid: 'testConfiguration2',
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

  // channelByName
  it('fgaUser01 has authentication to get channel by channel name', async () => {
    try {
      const {
        data: {
          data: { channelByName },
        },
      } = await channelApi.channelByName(fgaToken01, {
        orgId: org01._id,
        name: 'test-configuration1',
      });

      expect(channelByName.uuid).to.equal('testConfiguration1');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channelByName without authentication
  it('fgaUser01 does NOT have authentication to get channel by channel name', async () => {
    try {
      const {
        data: {
          data: { channelByName },
        },
      } = await channelApi.channelByName(fgaToken01, {
        orgId: org01._id,
        name: 'test-configuration2',
      });

      expect(channelByName).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channelsByTags
  it('fgaUser01 has authentication to get ALLOWED channel by channel tags', async () => {
    try {
      const {
        data: {
          data: { channelsByTags },
        },
      } = await channelApi.channelsByTags(fgaToken01, {
        orgId: org01._id,
        tags: ['tag_01'],
      });

      expect(channelsByTags.length).to.equal(1);
      expect(channelsByTags[0].uuid).to.equal('testConfiguration1');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channelVersion
  it('fgaUser01 has authentication to ADD and GET channel version by NAME and UUID', async () => {
    try {
      // step 1: add a channel version
      const result = await channelApi.addChannelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: 'testConfiguration1',
        name: `${'test-configuration1'}:v.0.1`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${'test-configuration1'}:v.0.1`
      });
      console.log( `addChannelVersion result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannelVersion = result.data.data.addChannelVersion;

      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // step 2: get a channel version
      const {
        data: {
          data: data,
          errors: errors
        },
      } = await channelApi.channelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: 'testConfiguration1',
        versionUuid: addChannelVersion.versionUuid,
      });
      if (errors) {
        expect.fail(errors[0].message);
      }
      const channelVersion = data.channelVersion;

      expect(channelVersion.channelName).to.equal('test-configuration1');
      expect(channelVersion.name).to.equal(`${'test-configuration1'}:v.0.1`);
      expect(channelVersion.content).to.equal('{"n0": 123.45}');
      expect(channelVersion.created).to.be.an('string');

      // step 3: get a channel version by name
      const {
        data: {
          data: { channelVersionByName },
        },
      } = await channelApi.channelVersionByName(fgaToken01, {
        orgId: org01._id,
        channelName: 'test-configuration1',
        versionName: `${'test-configuration1'}:v.0.1`,
      });

      expect(channelVersionByName.channelName).to.equal('test-configuration1');
      expect(channelVersionByName.name).to.equal(`${'test-configuration1'}:v.0.1`);
      expect(channelVersionByName.content).to.equal('{"n0": 123.45}');
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

  // addChannelVersion without authentication
  it('fgaUser01 does not have authentication to add channel version', async () => {
    try {
      const result = await channelApi.addChannelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: 'testConfiguration2',
        name: `${'test-configuration1'}:v.0.1`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${'test-configuration1'}:v.0.1`
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channelVersion without authentication
  it('fgaUser01 does not have authentication to get channel version', async () => {
    try {
      const result = await channelApi.channelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: 'testConfiguration2',
        versionUuid: 'testVersion1',
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // channelVersionByName without authentication
  it('fgaUser01 has authentication to get channel version by name', async () => {
    try {
      const result = await channelApi.channelVersionByName(fgaToken01, {
        orgId: org01._id,
        channelName: 'test-configuration2',
        versionName: `${'test-configuration1'}`,
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // removeChannelVersion
  it('fgaUser01 has authentication to add and remove channel version from a channel with another version', async () => {
    try {
      // step 1: add a channel version by admin token
      const result = await channelApi.addChannelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: 'testConfiguration1',
        name: `${'test-configuration1'}:v.0.3`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${'test-configuration1'}:v.0.3`
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
      } = await channelApi.removeChannelVersion(fgaToken01, {
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

  // removeChannelVersion without authentication
  it('fgaUser01 does not have authentication to remove channel version from a channel with another version', async () => {
    try {
      const result = await channelApi.removeChannelVersion(fgaToken01, {
        orgId: org01._id,
        uuid: 'testVersion2',
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // addChannel
  it('fgaUser02 has authentication to add a channel', async () => {
    try {
      const result = await channelApi.addChannel(fgaToken02, {
        orgId: org01._id,
        name: 'testConfiguration2',
        data_location: 'dal',
      });

      expect(result.data.data.addChannel.uuid).to.be.an('string');
      const channel1 = await models.Channel.findOne({uuid: result.data.data.addChannel.uuid});
      expect(channel1.data_location).to.equal('dal');

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // addChannel without authentication
  it('fgaUser01 does NOT have authentication to add a channel', async () => {
    try {
      const result = await channelApi.addChannel(fgaToken01, {
        orgId: org01._id,
        name: 'testConfiguration3',
        data_location: 'dal',
      });

      expect(result.data.data).to.equal(null);

    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // editChannel
  it('fgaUser01 has authentication to edit channel and update channel name', async () => {
    try {
      const result = await channelApi.editChannel(fgaToken01, {
        orgId: org01._id,
        uuid: 'testConfiguration1',
        name: `${'test-configuration1'}_new`
      });
      console.log( `editChannel result: ${JSON.stringify( result.data, null, 2 )}` );
      const editChannel = result.data.data.editChannel;

      expect(editChannel.success).to.equal(true);
      expect(editChannel.name).to.equal(`${'test-configuration1'}_new`);

    } catch(error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // editChannel without authentication
  it('fgaUser01 does NOT have authentication to edit channel and update channel name', async () => {
    try {
      const result = await channelApi.editChannel(fgaToken01, {
        orgId: org01._id,
        uuid: 'testConfiguration2',
        name: `${'test-configuration2'}_new`
      });

      expect(result.data.data).to.equal(null);

    } catch(error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  // removeChannel
  it('fgaUser01 has authentication to remove channel', async () => {
    try {
      const result2 = await channelApi.removeChannel(fgaToken01, {
        orgId: org01._id,
        uuid: 'testConfiguration1',
      });
      const removeChannel = result2.data.data.removeChannel;

      expect(removeChannel.success).to.equal(true);
      expect(removeChannel.uuid).to.equal('testConfiguration1');

      // step 3 validate the channel is not there
      const {
        data: {
          data: { channel },
        },
      } = await channelApi.channel(fgaToken01, {
        orgId: org01._id,
        uuid: 'testConfiguration1',
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

  // removeChannel without authentication
  it('fgaUser01 has authentication to remove channel', async () => {
    try {
      const result = await channelApi.removeChannel(fgaToken01, {
        orgId: org01._id,
        uuid: 'testConfiguration2',
      });

      expect(result.data.data).to.equal(null);

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
