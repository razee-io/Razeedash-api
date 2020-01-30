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
const { prepareUser, prepareOrganization, signInUser } = require(`./testHelper.${AUTH_MODEL}`);

let mongoServer;
let myApollo;
const graphql_port = 18004;
const graphql_url = `http://localhost:${graphql_port}/graphql`;
const api = apiFunc(graphql_url);

let org01Data;

let org_01;

let rootData;
let user01Data;

let presetOrgs;
let presetUsers;

const createOrganizations = async () => {
  org01Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/organization.spec.org_01.json`, 'utf8'));
  org_01 = await prepareOrganization(models, org01Data);
  console.log(`org_01 is ${org_01}`);
};

const createUsers = async () => {

  user01Data = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/organization.spec.user01.json`, 'utf8'));
  await prepareUser(models, user01Data);

  rootData = JSON.parse(fs.readFileSync(`./app/apollo/test/data/${AUTH_MODEL}/organization.spec.root.json`, 'utf8'));
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
    mongoServer = new MongoMemoryServer();
    const mongo_url = await mongoServer.getConnectionString();
    console.log(`resource.spec.js in memory test mongodb url is ${mongo_url}`);

    myApollo = await apollo({mongo_url, graphql_port});

    await createOrganizations();
    await createUsers();

    await getPresetOrgs();
    await getPresetUsers();

    setTimeout(function() {
      // why(); // logs out active handles that are keeping node running
    }, 5000);
  });

  after(async () => {
    await myApollo.db.connection.close();
    await mongoServer.stop();
    await myApollo.server.stop();
    await myApollo.httpServer.close(() => {
      console.log('🏄  Fancy razee-api Apollo Server closed.');
    });
  });

  describe('registrationUrl(org_id: String!): URL!', () => {
    let token;
    
    it('an admin user should be able to get registration url', async () => {
      try {
        token = await signInUser(models, api, rootData);
        console.log(`root token=${token}`);

        const meResult = await api.me(token);
        const { org_id } = meResult.data.data.me;
        const urlResult = await api.registrationUrl(token, { org_id });
        console.log(JSON.stringify(urlResult.data));
        expect(urlResult.data.data.registrationUrl.url).to.be.a('string');
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });

    it('a user should be able to get organizations associated with him.', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const orgsResult = await api.organizations(token);
        console.log(JSON.stringify(orgsResult.data));
        expect(orgsResult.data.data.organizations).to.be.a('array');
        expect(orgsResult.data.data.organizations.length).to.equal(1);
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });

    it('a non-admin user should NOT be able to get registration url', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const meResult = await api.me(token);
        const { org_id } = meResult.data.data.me;

        const urlResult = await api.registrationUrl(token, {org_id});
        
        console.log(JSON.stringify(urlResult.data));
        expect(urlResult.data.errors[0].message).to.be.a('string');
      } catch (error) {
        console.error('error response is ', error.response);
        // console.error('error response is ', JSON.stringify(error.response.data));
        throw error;
      }
    });
  });
});
