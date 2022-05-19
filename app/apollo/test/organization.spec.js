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
const orgKeyApi = orgKeyFunc(graphqlUrl);

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

    let org01 = {};

    it('a user should be able to get organizations associated with him.', async () => {
      try {
        token = await signInUser(models, api, user01Data);


        const orgsResult = await api.organizations(token);
        console.log(JSON.stringify(orgsResult.data));
        expect(orgsResult.data.data.organizations).to.be.a('array');
        expect(orgsResult.data.data.organizations.length).to.equal(1);

        org01 = orgsResult.data.data.organizations[0];
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });

    it('a user should be able to add an OrgKey', async () => {
      token = await signInUser(models, api, user01Data);
      try {
        const {
          data: {
            data: { addOrgKey },
          },
        } = await orgKeyApi.addOrgKey(token, {
          orgId: org01._id,
          name: 'orgKey1',
          primary: true
        });
        expect(addOrgKey.uuid).to.be.an('string');
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
