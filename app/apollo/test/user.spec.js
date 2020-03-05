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

const { prepareUser, prepareOrganization, signInUser } = require(`./testHelper.${AUTH_MODEL}`);

let mongoServer;
let myApollo;
let graphql_port = 18006;
let api = apiFunc(`http://localhost:${graphql_port}/graphql`);

let org01Data;

let org_01;

let rootData;
let user01Data;

let presetOrgs;
let presetUsers;

const createOrganizations = async () => {
  org01Data = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/user.spec.org_01.json`,
      'utf8',
    ),
  );
  org_01 = await prepareOrganization(models, org01Data);
  console.log(`org_01 is ${org_01}`);
};

const createUsers = async () => {
  user01Data = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/user.spec.user01.json`,
      'utf8',
    ),
  );
  await prepareUser(models, user01Data);

  rootData = JSON.parse(
    fs.readFileSync(
      `./app/apollo/test/data/${AUTH_MODEL}/user.spec.root.json`,
      'utf8',
    ),
  );
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

describe('user graphql', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    mongoServer = new MongoMemoryServer();
    const mongo_url = await mongoServer.getConnectionString();
    console.log(`user.spec.js in memory test mongodb url is ${mongo_url}`);
    myApollo = await apollo({
      mongo_url,
      graphql_port,
    });
    await createOrganizations();
    await createUsers();

    await getPresetOrgs();
    await getPresetUsers();

  });

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();
  });

  describe('me: User', () => {
    let token;

    it('returns a user after user sign in', async () => {
      try {
        token = await signInUser(models, api, user01Data);
        console.log(`user01 token=${token}`);

        const result1 = await api.me(token);
        console.log(JSON.stringify(result1.data));
        expect(result1.data.data.me.id).to.be.a('string');
        expect(result1.data.data.me.email).to.be.a('string');
      } catch (error) {
        // console.error('error response is ', error.response);
        console.error('error response is ', JSON.stringify(error.stack));
        throw error;
      }
    });
  });
});
