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
    let orgKeyUuid1 = null;
    let orgKeyUuid2 = null;

    it('a user should be able to get organizations associated with him.', async () => {
      try {
        token = await signInUser(models, api, user01Data);

        const orgsResult = await api.organizations(token);
        console.log(JSON.stringify(orgsResult.data));
        expect(orgsResult.data.data.organizations).to.be.a('array');
        expect(orgsResult.data.data.organizations.length).to.equal(1);

        readerOrg = orgsResult.data.data.organizations[0];
        console.log( `readerOrg: ${JSON.stringify(readerOrg, null, 2)}` );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
      try {
        token = await signInUser(models, api, rootData);

        const orgsResult = await api.organizations(token);
        console.log(JSON.stringify(orgsResult.data));
        expect(orgsResult.data.data.organizations).to.be.a('array');
        expect(orgsResult.data.data.organizations.length).to.equal(1);

        adminOrg = orgsResult.data.data.organizations[0];
        console.log( `adminOrg: ${JSON.stringify(adminOrg, null, 2)}` );
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });

    it('an admin user should be able to add an OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `adding ${orgKeyName1} to '${adminOrg.id}'` );
        const {
          data: {
            data: { addOrgKey },
          },
        } = await orgKeyApi.addOrgKey(token, {
          orgId: adminOrg.id,
          name: orgKeyName1,
          primary: true
        });
        expect(addOrgKey.uuid).to.be.an('string');

        orgKeyUuid1 = addOrgKey.uuid;
        console.log( `orgKeyUuid1: ${orgKeyUuid1}` );
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
        const {
          data: {
            data: { addOrgKey },
          },
        } = await orgKeyApi.addOrgKey(token, {
          orgId: adminOrg.id,
          name: orgKeyName2,
          primary: true
        });
        expect(addOrgKey.uuid).to.be.an('string');

        orgKeyUuid2 = addOrgKey.uuid;
        console.log( `orgKeyUuid2: ${orgKeyUuid2}` );
      } catch (error) {
        if (error.response) {
          console.error('error encountered:  ', error.response.data);
        } else {
          console.error('error encountered:  ', error);
        }
        throw error;
      }
    });

    it('an admin user should be able to list OrgKeys', async () => {
      token = await signInUser(models, api, rootData);
      try {
        const {
          data: {
            data: { orgKeys },
          },
        } = await orgKeyApi.orgKeys(token, {
          orgId: adminOrg.id
        });
        expect(orgKeys).to.be.a('array');
        expect(orgKeys.length).to.equal(3); // 3: original apikey plus the two just added
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
        const {
          data: {
            data: { orgKey },
          },
        } = await orgKeyApi.orgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid1,
          name: null
        });
        expect(orgKey.uuid).to.equal(orgKeyUuid1);
        expect(orgKey.name).to.equal(orgKeyName1);
        // Because second orgKey was created, second orgKey became 'primary'.  OrgKey1 should not be primary.
        expect(orgKey.primary).to.equal(false);
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
        const {
          data: {
            data: { orgKey },
          },
        } = await orgKeyApi.orgKey(token, {
          orgId: adminOrg.id,
          uuid: null,
          name: orgKeyName2
        });
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
        const {
          data: {
            data: { editOrgKey },
          },
        } = await orgKeyApi.editOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid1,
          name: orgKeyName1+'_newname',
          primary: true
        });
        console.log( `modified: ${JSON.stringify(editOrgKey)}` );
        expect(editOrgKey.modified).to.equal(1);
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
        const {
          data: {
            data: { orgKey },
          },
        } = await orgKeyApi.orgKey(token, {
          orgId: adminOrg.id,
          uuid: null,
          name: orgKeyName1+'_newname'
        });
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

    it('an admin user should be able to remove a non-Primary OrgKey', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `removing ${orgKeyUuid2} from '${adminOrg.id}'` );
        const {
          data: {
            data: { removeOrgKey },
          },
        } = await orgKeyApi.removeOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid2
        });
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
    it('an admin user SHOULD be able to remove a Primary OrgKey with forceDeletion', async () => {
      token = await signInUser(models, api, rootData);
      try {
        console.log( `removing ${orgKeyUuid1} from '${adminOrg.id}' with forceDeletion` );
        const {
          data: {
            data: { removeOrgKey },
          },
        } = await orgKeyApi.removeOrgKey(token, {
          orgId: adminOrg.id,
          uuid: orgKeyUuid1,
          forceDeletion: true
        });
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
  });
});
