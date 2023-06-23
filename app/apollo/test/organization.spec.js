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

const apiFunc = require('./api');
const clusterFunc = require('./clusterApi');
const channelFunc = require('./channelApi');
const { models } = require('../models');
const apollo = require('../index');
const { AUTH_MODEL } = require('../models/const');

// If external auth model specified, use it.  Else use built-in auth model.
const externalAuth = require('../../externalAuth.js');
const testHelperPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testPath : `./testHelper.${AUTH_MODEL}`;
const { prepareUser, prepareOrganization, signInUser } = require(testHelperPath);
const testDataPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testDataPath : `./app/apollo/test/data/${AUTH_MODEL}`;

let mongoServer;
let myApollo;
const graphql_port = 18003;
const graphql_url = `http://localhost:${graphql_port}/graphql`;
const api = apiFunc(graphql_url);
const channelApi = channelFunc(graphql_url);
const clusterApi = clusterFunc(graphql_url);

const orgKeyFunc = require('./orgKeyApi');
const orgKeyApi = orgKeyFunc(graphql_url);

let org01Data;

let org_01;

let rootData;
let user01Data;

let presetOrgs;
let presetUsers;

const createOrganizations = async () => {
  org01Data = JSON.parse(fs.readFileSync(`${testDataPath}/organization.spec.org_01.json`, 'utf8'));
  org_01 = await prepareOrganization(models, org01Data);
  console.log(`org_01 is ${org_01}`);
};

const createUsers = async () => {

  user01Data = JSON.parse(fs.readFileSync(`${testDataPath}/organization.spec.user01.json`, 'utf8'));
  await prepareUser(models, user01Data);

  rootData = JSON.parse(fs.readFileSync(`${testDataPath}/organization.spec.root.json`, 'utf8'));
  await prepareUser(models, rootData);

  return {};
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


describe('organization graphql test suite', () => {
  // eslint-disable-next-line no-unused-vars
  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer( { binary: { version: '4.2.17' } } );
    await mongoServer.start();
    const mongo_url = mongoServer.getUri();
    console.log(`resource.spec.js in memory test mongodb url is ${mongo_url}`);

    myApollo = await apollo({mongo_url, graphql_port});

    await createOrganizations();
    await createUsers();

    //await createChannel();

    await getPresetOrgs();
    await getPresetUsers();

  });

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  });

  describe('organisations(org_id: String!): URL!', () => {
    let token;

    let readerOrg = {};
    let adminOrg = {};
    const orgKeyName1 = 'orgKey1';
    const orgKeyName2 = 'orgKey2';
    let orgKeyUuid0 = null;
    let orgKeyUuid1 = null;
    let orgKeyUuid2 = null;
    let orgKeyVal1 = null;
    let channel1Uuid = null;
    let initialOrgKeyVersionUuid = null;

    it('a user should be able to get organizations associated with him.', async () => {
      try {
        token = await signInUser(models, api, user01Data);

        const response = await api.organizations(token);
        console.log( `organizations (user01) response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const organizations = response.data.data.organizations;

        expect(organizations).to.be.a('array');
        expect(organizations.length).to.equal(1);

        readerOrg = organizations[0];
        console.log( `readerOrg: ${JSON.stringify(readerOrg, null, 2)}` );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
      try {
        token = await signInUser(models, api, rootData);

        const response = await api.organizations(token);
        console.log( `organizations (admin) response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const organizations = response.data.data.organizations;

        expect(organizations).to.be.a('array');
        expect(organizations.length).to.equal(1);

        adminOrg = organizations[0];
        console.log( `adminOrg: ${JSON.stringify(adminOrg, null, 2)}` );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });

    it('an admin user should be able to list OrgKeys', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const response = await orgKeyApi.orgKeys(token, {
          orgId: adminOrg.id
        });
        console.log( `orgKeys response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const orgKeys = response.data.data.orgKeys;

        expect(orgKeys).to.be.a('array');
        expect(orgKeys.length).to.equal(1); // 1: original key only

        orgKeyUuid0 = orgKeys[0].key;
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('creating a new Version should encrypt with the initial OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        let response = await channelApi.addChannel(token, {
          orgId: adminOrg.id,
          name: 'a_random_name',
          data_location: 'dal'
        });
        console.log( `addChannel 'a_random_name' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const addChannel = response.data.data.addChannel;

        channel1Uuid = addChannel.uuid;

        response = await channelApi.addChannelVersion(token, {
          orgId: adminOrg.id,
          channelUuid: channel1Uuid,
          name: 'ver1-origOrgKey',
          type: 'application/yaml',
          content: '{"info": "This content encrypted with original OrgKey"}',
          description: 'Version encrypted with origOrgKey'
        });
        console.log( `addChannelVersion 'ver1-origOrgKey' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const addChannelVersion = response.data.data.addChannelVersion;

        expect(addChannelVersion.success).to.equal(true);
        initialOrgKeyVersionUuid = addChannelVersion.versionUuid;

        //Debug
        const versions = await models.DeployableVersion.find({ uuid: initialOrgKeyVersionUuid}).lean();
        console.log( `versions after creating initial: ${JSON.stringify( versions, null, 2 )}` );
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to add an OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `adding ${orgKeyName1} to '${adminOrg.id}'` );
        const response = await orgKeyApi.addOrgKey(token, {
          orgId: adminOrg.id,
          name: orgKeyName1,
          primary: true
        });
        console.log( `addOrgKey '${orgKeyName1}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const addOrgKey = response.data.data.addOrgKey;
        expect(addOrgKey.uuid).to.be.an('string');

        orgKeyUuid1 = addOrgKey.uuid;
        console.log( `orgKeyUuid1: ${orgKeyUuid1}` );

        // Allow time for async re-encryption.
        // Ideally tests would verify old orgkey deletion fails as expected while re-encryption is in process, but it will usually finish faster than the next test can execute even without a delay.
        await sleep(1000);

        //Debug
        const versions = await models.DeployableVersion.find({ uuid: initialOrgKeyVersionUuid}).lean();
        console.log( `versions after creating new orgkey: ${JSON.stringify( versions, null, 2 )}` );
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to add a second OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `adding ${orgKeyName2} to '${adminOrg.id}'` );
        const response = await orgKeyApi.addOrgKey(token, {
          orgId: adminOrg.id,
          name: orgKeyName2,
          primary: true
        });
        console.log( `addOrgKey '${orgKeyName2}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const addOrgKey = response.data.data.addOrgKey;
        expect(addOrgKey.uuid).to.be.an('string');

        orgKeyUuid2 = addOrgKey.uuid;
        console.log( `orgKeyUuid2: ${orgKeyUuid2}` );

        // Allow time for async re-encryption.
        // Ideally tests would verify old orgkey deletion fails as expected while re-encryption is in process, but it will usually finish faster than the next test can execute even without a delay.
        await sleep(1000);

        //Debug
        const versions = await models.DeployableVersion.find({ uuid: initialOrgKeyVersionUuid}).lean();
        console.log( `versions after creating new orgkey 2: ${JSON.stringify( versions, null, 2 )}` );
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to list OrgKeys and see added keys', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const response = await orgKeyApi.orgKeys(token, {
          orgId: adminOrg.id
        });
        console.log( `orgKeys response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const orgKeys = response.data.data.orgKeys;

        expect(orgKeys).to.be.a('array');
        expect(orgKeys.length).to.equal(3); // 3: original key plus the two just added
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to get an OrgKey by UUID', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const response = await orgKeyApi.orgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid1,
          name: null
        });
        console.log( `orgKey '${orgKeyUuid1}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const orgKey = response.data.data.orgKey;

        expect(orgKey.uuid).to.equal(orgKeyUuid1);
        expect(orgKey.name).to.equal(orgKeyName1);
        // Because second orgKey was created, second orgKey became 'primary'.  OrgKey1 should not be primary.
        expect(orgKey.primary).to.equal(false);

        orgKeyVal1 = orgKey.key;
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to get an OrgKey by Name', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const response = await orgKeyApi.orgKey(token, {
          orgId: adminOrg.id,
          uuid: null,
          name: orgKeyName2
        });
        console.log( `orgKey '${orgKeyName2}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const orgKey = response.data.data.orgKey;

        expect(orgKey.uuid).to.equal(orgKeyUuid2);
        expect(orgKey.name).to.equal(orgKeyName2);
        // Because second orgKey was created, second orgKey became 'primary'
        expect(orgKey.primary).to.equal(true);
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to edit an OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const response = await orgKeyApi.editOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid1,
          name: orgKeyName1+'_newname',
          primary: true
        });
        console.log( `editOrgKey '${orgKeyUuid1}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const editOrgKey = response.data.data.editOrgKey;

        expect(editOrgKey.modified).to.equal(1);

        // Allow time for async re-encryption.
        // Ideally tests would verify old orgkey deletion fails as expected while re-encryption is in process, but it will usually finish faster than the next test can execute even without a delay.
        await sleep(1000);

        //Debug
        const versions = await models.DeployableVersion.find({ uuid: initialOrgKeyVersionUuid}).lean();
        console.log( `versions after editing orgkey1: ${JSON.stringify( versions, null, 2 )}` );
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
      // Verify the change took effect
      try {
        const response = await orgKeyApi.orgKey(token, {
          orgId: adminOrg.id,
          uuid: null,
          name: orgKeyName1+'_newname'
        });
        console.log( `orgKey '${orgKeyName1+'_newname'}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const orgKey = response.data.data.orgKey;

        expect(orgKey.uuid).to.equal(orgKeyUuid1);
        expect(orgKey.name).to.equal(orgKeyName1+'_newname');
        // OrgKey1 is now primary again, and OrgKey2 is not
        expect(orgKey.primary).to.equal(true);
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to remove the initial OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `removing ${orgKeyUuid2} from '${adminOrg.id}'` );
        const response = await orgKeyApi.removeOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid0
        });
        console.log( `removeOrgKey '${orgKeyUuid0}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const removeOrgKey = response.data.data.removeOrgKey;

        expect(removeOrgKey.success).to.equal(true);

        //Debug
        const versions = await models.DeployableVersion.find({ uuid: initialOrgKeyVersionUuid}).lean();
        console.log( `versions after deleting orgkey0: ${JSON.stringify( versions, null, 2 )}` );
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to remove a non-Primary OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        //Debug
        const versions = await models.DeployableVersion.find({ uuid: initialOrgKeyVersionUuid}).lean();
        console.log( `versions before deleting orgkey2 (${orgKeyUuid2}): ${JSON.stringify( versions, null, 2 )}` );

        console.log( `removing ${orgKeyUuid2} from '${adminOrg.id}'` );
        const response = await orgKeyApi.removeOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid2
        });
        console.log( `removeOrgKey '${orgKeyUuid2}' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const removeOrgKey = response.data.data.removeOrgKey;

        expect(removeOrgKey.success).to.equal(true);
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should NOT be able to remove a Primary OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `removing ${orgKeyUuid1} from '${adminOrg.id}'` );
        const response = await orgKeyApi.removeOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid1
        });

        expect(response.data.errors).to.exist;
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should NOT be able to remove an OrgKey if it is the last one', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `removing ${orgKeyUuid1} from '${adminOrg.id}' with forceDeletion` );
        const response = await orgKeyApi.removeOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid1,
          forceDeletion: true
        });
        console.log( `removeOrgKey '${orgKeyUuid1}' response: ${JSON.stringify( response.data, null, 2 )}` );

        expect(response.data.errors).to.exist;
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('registering a Cluster should return URL and headers containing the remaining new OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const response = await clusterApi.registerCluster(token, {
          orgId: adminOrg.id,
          registration: { name: 'newOrgKeyCluster' },
        });
        console.log( `registerCluster 'newOrgKeyCluster' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const registerCluster = response.data.data.registerCluster;

        expect(registerCluster.url).to.be.an('string');
        expect(registerCluster.url).to.not.contain(orgKeyVal1); // orgKey no longer passed as URL query parameter
        expect(registerCluster.headers['razee-org-key']).to.equal(orgKeyVal1);
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('creating a new Version should encrypt with the remaining OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const response = await channelApi.addChannelVersion(token, {
          orgId: adminOrg.id,
          channelUuid: channel1Uuid,
          name: 'ver2-remainingOrgKey',
          type: 'application/yaml',
          content: '{"info": "This content encrypted with remaining OrgKey"}',
          description: 'Version encrypted with remainingOrgKey'
        });
        console.log( `addChannelVersion 'ver2-remainingOrgKey' response: ${JSON.stringify( response.data, null, 2 )}` );
        if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
        const addChannelVersion = response.data.data.addChannelVersion;

        expect(addChannelVersion.success).to.equal(true);
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('Version contents originally encrypted with different OrgKeys should be retrievable', async () => {
      token = await signInUser(models, api, rootData);
      try {
        // Get all Versions from the DB
        const versions = await models.DeployableVersion.find({}).lean();
        console.log( `versions: ${JSON.stringify( versions, null, 2 )}` );

        // For each version, get via API and verify contents are retrieved and decrypted correctly eventhough they were originally encrypted by different keys
        for( const v of versions ) {
          const response = await channelApi.channelVersion(token, {
            orgId: adminOrg.id,
            channelUuid: channel1Uuid,
            versionUuid: v.uuid,
          });
          console.log( `version '${v.uuid} response': ${JSON.stringify( response.data, null, 2 )}` );
          if (response.data.errors && response.data.errors.length > 0) expect.fail(response.data.errors[0].message);
          const channelVersion = response.data.data.channelVersion;

          expect(channelVersion.content).to.contain('This content encrypted with');
        }
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
});
