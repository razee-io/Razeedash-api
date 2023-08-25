/**
 * Copyright 2023 IBM Corp. All Rights Reserved.
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

/*
* Fine-Grained-Authorization (FGA) allows the auth model to determine access to resources based on the name or id of the resource, and on the action being taken (e.g. read vs edit).
* This test suite provides validation of FGA behavior for auth models that support it by verifying that users with different FGA permissions are correctly allowed or restricted.
* Other test suites will validate behavior based on having admin permissions (or lack thereof) independently.
*/

const { expect } = require('chai');
const fs = require('fs');
const { v4: UUID } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { models } = require('../models');
const authFunc = require('./api');
const channelFunc = require('./channelApi');

const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');
// If the current auth model does not support FGA, skip FGA unit tests without error.
if (AUTH_MODEL === 'extauthtest' || AUTH_MODEL === 'passport.local') {
  console.log(`Found non fine-grained auth model: ${AUTH_MODEL}. Skipping fine-grained auth tests.`);
  return process.exit(0);
}
const externalAuth = require('../../externalAuth.js');
const testHelperPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testPath : `./testHelper.${AUTH_MODEL}`;
const { prepareUser, prepareOrganization, signInUser } = require(testHelperPath);
const testDataPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testDataPath : `./app/apollo/test/data/${AUTH_MODEL}`;

let mongoServer;
let myApollo;

const graphqlPort = 18000;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;
const authApi = authFunc(graphqlUrl);
const channelApi = channelFunc(graphqlUrl);

let fgaToken01, fgaToken02;
let fgaUser01Data, fgaUser02Data;
let org01Data, org01;
let testChannel1, testChannel2;
let testVersion1, testVersion2;
let testGroup1, testGroup2;

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
  testChannel1 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-channel1-uuid',
    name: 'test-channel1-name',
    versions: [],  /* channel versions is deprecated and no longer used */
    tags: ['tag_01'],
    contentType: 'local'
  };
  await models.Channel.create(testChannel1);
  testChannel2 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-channel2-uuid',
    name: 'test-channel2-name',
    versions: [],  /* channel versions is deprecated and no longer used */
    tags: ['tag_02'],
    contentType: 'local'
  };
  await models.Channel.create(testChannel2);
};

const createVersions = async () => {
  testVersion1 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-version1-uuid',
    name: 'test-version1-name',
    channel_id: testChannel1.uuid,
    channel_name: testChannel1.name
  };
  await models.DeployableVersion.create(testVersion1);
  testVersion2 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-version2-uuid',
    name: 'test-version2-name',
    channel_id: testChannel2.uuid,
    channel_name: testChannel2.name
  };
  await models.DeployableVersion.create(testVersion2);
};

const createGroups = async () => {
  testGroup1 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-group1-uuid',
    name: 'test-group1-name',
    owner: 'undefined'
  };
  await models.Group.create(testGroup1);
  testGroup2 = {
    _id: UUID(),
    org_id: org01._id,
    uuid: 'test-group2-uuid',
    name: 'test-group2-name',
    owner: 'undefined'
  };
  await models.Group.create(testGroup2);
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

    fgaToken01 = await signInUser(models, authApi, fgaUser01Data);
    fgaToken02 = await signInUser(models, authApi, fgaUser02Data);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  }); // after

  // channels fgaUser01
  it('fgaUser01 has authorization to get ALLOWED channels', async () => {
    let response;
    try {
      response = await channelApi.channels(fgaToken01, {
        orgId: org01._id,
      });
      expect(response.data.data.channels).to.have.length(1);
      expect(response.data.data.channels[0].name).to.equal(testChannel1.name);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channels fgaUser02
  it('fgaUser02 has authorization to get ALLOWED channels', async () => {
    let response;
    try {
      response = await channelApi.channels(fgaToken02, {
        orgId: org01._id,
      });
      expect(response.data.data.channels).to.have.length(1);
      expect(response.data.data.channels[0].name).to.equal(testChannel2.name);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channel
  it('fgaUser01 has authorization to get channel 1 by channel uuid', async () => {
    let response;
    try {
      response = await channelApi.channel(fgaToken01, {
        orgId: org01._id,
        uuid: testChannel1.uuid,
      });
      expect(response.data.data.channel.uuid).to.equal(testChannel1.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channel without authorization
  it('fgaUser01 does NOT have authorization to get channel 2 by channel uuid', async () => {
    let response;
    try {
      response = await channelApi.channel(fgaToken01, {
        orgId: org01._id,
        uuid: testChannel2.uuid,
      });
      expect(response.data.data.channel).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channelByName
  it('fgaUser01 has authorization to get channel 1 by channel name', async () => {
    let response;
    try {
      response = await channelApi.channelByName(fgaToken01, {
        orgId: org01._id,
        name: testChannel1.name,
      });
      expect(response.data.data.channelByName.uuid).to.equal(testChannel1.uuid);
      expect(response.data.data.channelByName.name).to.equal(testChannel1.name);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channelByName without authorization
  it('fgaUser01 does NOT have authorization to get channel 2 by channel name', async () => {
    let response;
    try {
      response = await channelApi.channelByName(fgaToken01, {
        orgId: org01._id,
        name: testChannel2.name,
      });
      expect(response.data.data.channelByName).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channelsByTags
  it('fgaUser01 has authorization to get ALLOWED channel 1 by channel tags', async () => {
    let response;
    try {
      response = await channelApi.channelsByTags(fgaToken01, {
        orgId: org01._id,
        tags: testChannel1.tags,
      });
      expect(response.data.data.channelsByTags.length).to.equal(1);
      expect(response.data.data.channelsByTags[0].uuid).to.equal(testChannel1.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channelVersion
  it('fgaUser01 has authorization to ADD and GET channel 1 version by NAME and UUID', async () => {
    let response;
    try {
      // step 1: add a channel version
      response = await channelApi.addChannelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: testChannel1.uuid,
        name: `${testChannel1.name}:v.0.1`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${testChannel1.name}:v.0.1`
      });
      const addChannelVersion = response.data.data.addChannelVersion;
      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // step 2: get the newly created channel version
      response = await channelApi.channelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: testChannel1.uuid,
        versionUuid: addChannelVersion.versionUuid,
      });
      const channelVersion = response.data.data.channelVersion;
      expect(channelVersion.channelName).to.equal(testChannel1.name);
      expect(channelVersion.created).to.be.an('string');

      // step 3: get the newly created channel version by name
      response = await channelApi.channelVersionByName(fgaToken01, {
        orgId: org01._id,
        channelName: testChannel1.name,
        versionName: `${testChannel1.name}:v.0.1`,
      });
      const channelVersionByName = response.data.data.channelVersionByName;
      expect(channelVersionByName.channelName).to.equal(testChannel1.name);
      expect(channelVersionByName.created).to.be.an('string');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // addChannelVersion without authorization
  it('fgaUser01 does NOT have authorization to add channel 2 version', async () => {
    let response;
    try {
      response = await channelApi.addChannelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: testChannel2.uuid,
        name: `${testChannel1.name}:v.0.1`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${testChannel1.name}:v.0.1`
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channelVersion without authorization
  it('fgaUser01 does NOT have authorization to get channel 2 version', async () => {
    let response;
    try {
      response = await channelApi.channelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: testChannel2.uuid,
        versionUuid: testVersion1.uuid,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // channelVersionByName without authorization
  it('fgaUser01 does NOT authorization to get channel version 1 by name', async () => {
    let response;
    try {
      response = await channelApi.channelVersionByName(fgaToken01, {
        orgId: org01._id,
        channelName: testChannel2.name,
        versionName: `${testChannel1.name}`,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeChannelVersion
  it('fgaUser01 has authorization to add and remove channel version 1 from a channel with another version', async () => {
    let response;
    try {
      // step 1: add a channel version
      response = await channelApi.addChannelVersion(fgaToken01, {
        orgId: org01._id,
        channelUuid: testChannel1.uuid,
        name: `${testChannel1.name}:v.0.3`,
        type: 'yaml',
        content: '{"n0": 123.45}',
        description: `${testChannel1.name}:v.0.3`
      });
      const addChannelVersion = response.data.data.addChannelVersion;
      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // step 2: delete the newly added channel version
      response = await channelApi.removeChannelVersion(fgaToken01, {
        orgId: org01._id,
        uuid: addChannelVersion.versionUuid,
      });
      const removeChannelVersion = response.data.data.removeChannelVersion;
      expect(removeChannelVersion.success).to.equal(true);
      expect(removeChannelVersion.uuid).to.equal(addChannelVersion.versionUuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeChannelVersion without authorization
  it('fgaUser01 does not have authorization to remove channel version 2 from a channel with another version', async () => {
    let response;
    try {
      response = await channelApi.removeChannelVersion(fgaToken01, {
        orgId: org01._id,
        uuid: testVersion2.uuid,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // addChannel
  it('fgaUser02 has authorization to add a channel 2', async () => {
    let response;
    try {
      response = await channelApi.addChannel(fgaToken02, {
        orgId: org01._id,
        name: testChannel2.uuid, // Use testChannel2.uuid due to fgaUser02 having authorization for that value
        data_location: 'dal',
      });
      expect(response.data.data.addChannel.uuid).to.be.an('string');
      const channel = await models.Channel.findOne({uuid: response.data.data.addChannel.uuid});
      expect(channel.name).to.equal(testChannel2.uuid);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // addChannel without authorization
  it('fgaUser01 does NOT have authorization to add non-authorized channel 3', async () => {
    let response;
    try {
      response = await channelApi.addChannel(fgaToken01, {
        orgId: org01._id,
        name: 'testConfiguration3',
        data_location: 'dal',
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // editChannel
  it('fgaUser01 has authorization to edit channel 1 and update channel 1 name', async () => {
    let response;
    try {
      response = await channelApi.editChannel(fgaToken01, {
        orgId: org01._id,
        uuid: testChannel1.uuid,
        name: `${testChannel1.name}_new`
      });
      expect(response.data.data.editChannel.success).to.equal(true);
      expect(response.data.data.editChannel.name).to.equal(`${testChannel1.name}_new`);
    } catch(error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // editChannel without authorization
  it('fgaUser01 does NOT have authorization to edit channel 2 and update channel 2 name', async () => {
    let response;
    try {
      response = await channelApi.editChannel(fgaToken01, {
        orgId: org01._id,
        uuid: testChannel2.uuid,
        name: `${testChannel2.name}_new`
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch(error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeChannel
  it('fgaUser01 has authorization to remove channel 1', async () => {
    let response;
    try {
      // step 1: remove the channel
      response = await channelApi.removeChannel(fgaToken01, {
        orgId: org01._id,
        uuid: testChannel1.uuid,
      });
      const removeChannel = response.data.data.removeChannel;
      expect(removeChannel.success).to.equal(true);
      expect(removeChannel.uuid).to.equal(testChannel1.uuid);

      // step 2: validate the channel is not there
      response = await channelApi.channel(fgaToken01, {
        orgId: org01._id,
        uuid: testChannel1.uuid,
      });
      expect(response.data.data.channel).to.equal(null);
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });

  // removeChannel without authorization
  it('fgaUser01 does NOT have authorization to remove channel 2', async () => {
    let response;
    try {
      response = await channelApi.removeChannel(fgaToken01, {
        orgId: org01._id,
        uuid: testChannel2.uuid,
      });
      expect(response.data.data).to.equal(null);
      expect(response.data.errors[0].message).to.contain('You are not allowed');
    } catch (error) {
      console.error(JSON.stringify({'API response:': response && response.data ? response.data : 'unexpected response'}, null, 3));
      console.error('Test failure, error: ', error);
      throw error;
    }
  });
});
