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

'use strict';

const { AUTH_MODEL } = require('../models/const');

// If external auth model specified, use it.  Else use built-in auth model.
const externalAuth = require('../../externalAuth.js');
const testHelperPath = externalAuth.ExternalAuthModels[AUTH_MODEL] ? externalAuth.ExternalAuthModels[AUTH_MODEL].testPath : `./testHelper.${AUTH_MODEL}`;
const { signInUser } = require(testHelperPath);

// Service subscriptions require super-user,
// which is implemented only in local auth model
if (AUTH_MODEL !== 'local') {
  return; // eslint-disable-line
}

const createTestData = require('./serviceSubscriptions.spec.data');

const { expect } = require('chai');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { models } = require('../models');
const resourceFunc = require('./api');
const serviceSubscriptionQueries = require('./serviceSubscriptionQueries');

const apollo = require('../index');
const { GraphqlPubSub } = require('../subscription');

// ------------------------------------------------------------------

const graphqlPort = 18011;
const graphqlUrl = `http://localhost:${graphqlPort}/graphql`;

const resourceApi = resourceFunc(graphqlUrl);
const queries = serviceSubscriptionQueries(graphqlUrl);

const orgAdminKey = 'huge-secret';
const user01cred = { email: 'user01@us.ibm.com', password: 'password123' };
const user02cred = { email: 'user02@us.ibm.com', password: 'password123', orgAdminKey };

describe('Service subscription graphql test suite', () => {
  let mongoServer;
  let myApollo;
  let testData;
  let user01token;
  let user02superUserToken;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ORG_ADMIN_KEY = orgAdminKey;
    mongoServer = await MongoMemoryServer.create();
    const mongoUrl = mongoServer.getUri();
    console.log(`\tCluster.js in memory test mongodb url is ${mongoUrl}`);

    myApollo = await apollo({
      mongo_url: mongoUrl,
      graphql_port: graphqlPort,
    });

    testData = await createTestData();
    user01token = await signInUser(models, resourceApi, user01cred);
    user02superUserToken = await signInUser(models, resourceApi, user02cred);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    GraphqlPubSub.deleteInstance();
    await mongoServer.stop();
  }); // after

  it('Get subscription type returns SERVICE', async () => {
    const { data: result } =
      await queries.subscriptionType(user02superUserToken, {
        orgId: testData.org01._id,
        id: testData.serSub1.uuid,
      });
    printResults(result);
    expect(result.data.subscriptionType).to.equal('SERVICE');
  });

  it('Get subscription type returns USER', async () => {
    const { data: result } =
      await queries.subscriptionType(user01token, {
        orgId: testData.org01._id,
        id: testData.userSub1.uuid,
      });
    printResults(result);
    expect(result.data.subscriptionType).to.equal('USER');
  });

  it('Add a service subscription fails when non-superuser calls the api', async () => {
    const { data: result } =
      await queries.addServiceSubscription(user01token, {
        orgId: testData.org01._id,
        name: 'a_random_name',
        clusterId: testData.cluster2Data.cluster_id,
        channelUuid: testData.channelData.uuid,
        versionUuid: testData.channelData.versions[0].uuid,
      });
    printResults(result);
    expect(result.errors[0].message).to.include('not allowed');
  });

  it('Add a service subscription', async () => {
    const { data: result } =
      await queries.addServiceSubscription(user02superUserToken, {
        orgId: testData.org01._id,
        name: 'my awesome new service subscription',
        clusterId: testData.cluster2Data.cluster_id,
        channelUuid: testData.channelData.uuid,
        versionUuid: testData.channelData.versions[0].uuid,
      });
    printResults(result);
    expect(result.data.addServiceSubscription).to.be.an('string');
  });

  it('Get service subscriptions should return two items', async () => {
    const { data: result } =
      await queries.serviceSubscriptions(user02superUserToken, {
        orgId: testData.org01._id
      });
    printResults(result); // second item is added by one of the previous tests
    expect(result.data.serviceSubscriptions.length).to.equal(2);
    expect(result.data.serviceSubscriptions
      .find(i => i.ssid === testData.serSub1._id)).to.be.an('object');
  });

  it('Get all subscriptions should return three items and correct resource data', async () => {
    const { data: result } =
      await queries.allSubscriptions(user02superUserToken, {
        orgId: testData.org01._id
      });
    printResults(result); // two existing and one added by one of the previous tests
    expect(result.data.subscriptions.length).to.equal(3);
    const ss = result.data.subscriptions.find(i => i.uuid === testData.serSub1.uuid);
    expect(ss.subscriptionType).to.equal('ServiceSubscription');
    expect(ss.remoteResources[0].cluster.clusterId).to.equal(testData.cluster2Data.cluster_id);
  });

  it('Get service subscription should return correct object', async () => {
    const { data: result } =
      await queries.serviceSubscription(user02superUserToken, {
        orgId: testData.org01._id,
        ssid: testData.serSub1._id
      });
    printResults(result);
    expect(result.data.serviceSubscription.ssid).to.equal(testData.serSub1._id);
    expect(result.data.serviceSubscription.owner.name).to.equal('user02');
  });

  it('Deleting cluster should not cause service subscriptions retrieval to fail', async () => {
    const ss = await models.Cluster.findOneAndDelete({ cluster_id: testData.cluster2Data.cluster_id });
    expect(ss.cluster_id).to.equal(testData.cluster2Data.cluster_id); // make sure cluster is really deleted
    // get service subscriptions still should return two items
    const { data: result } =
      await queries.serviceSubscriptions(user02superUserToken, {
        orgId: testData.org01._id
      });
    printResults(result);
    expect(result.data.serviceSubscriptions.length).to.equal(2);
  });

  // Pre-defined cluster cluster2Data.cluster_id is now deleted, do not use it in the tests below

  it('Edit service subscription should update the object', async () => {
    const newName = 'updated service subscription';
    const { data: result } =
      await queries.editServiceSubscription(user02superUserToken, {
        orgId: testData.org01._id,
        ssid: testData.serSub1._id,
        name: newName,
        channelUuid: testData.serSub1.channelUuid,
        versionUuid: testData.serSub1.versionUuid
      });
    printResults(result);
    expect(result.data.editServiceSubscription).to.equal(testData.serSub1._id);
    const ss = await models.ServiceSubscription.findById(testData.serSub1._id);
    expect(ss.name).to.equal(newName);
  });

  it('Remove service subscription should remove the object, even if it targets removed cluster', async () => {
    const { data: result } =
      await queries.removeServiceSubscription(user02superUserToken, {
        orgId: testData.org01._id,
        ssid: testData.serSub1._id
      });
    printResults(result);
    expect(result.data.removeServiceSubscription).to.equal(testData.serSub1._id);
    const ss = await models.ServiceSubscription.findById(testData.serSub1._id);
    expect(ss).to.be.an('null');
  });

  it('Should not be able to remove version if it is used in a service subscription', async () => {
    const { data: result } =
      await queries.removeChannelVersion(user01token, {
        orgId: testData.org01._id,
        uuid: testData.channelData.versions[0].uuid
      });
    printResults(result);
    expect(result.errors[0].message).to.include('depend on this');
  });
});

function printResults(result) {
  if (result.errors) {
    console.log('\tApi error: ' + JSON.stringify(result.errors));
  } else {
    console.log('\tApi result: ' + JSON.stringify(result.data));
  }
}
