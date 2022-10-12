/**
 * Copyright 2022 IBM Corp. All Rights Reserved.
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
const channelRemoteFunc = require('./channelRemoteApi');
const subscriptionFunc = require('./subscriptionsApi');

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
const channelRemoteApi = channelRemoteFunc(graphqlUrl);
const subscriptionApi = subscriptionFunc(graphqlUrl);

let userRootData;
let userRootToken;
let org01;
let org01Key;
let channel01Uuid;
let ver01Uuid;
let sub01Uuid;

const cluster01Uuid = UUID();
const group01Uuid = UUID();
const group01Name = 'testGroup';

const createOrganizations = async () => {
  const org01Data = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.org_01.json`,
      'utf8',
    ),
  );
  org01 = await prepareOrganization(models, org01Data);
  org01Key = org01.orgKeys[0];
};

const createUsers = async () => {
  userRootData = JSON.parse(
    fs.readFileSync(
      `${testDataPath}/cluster.spec.root.json`,
      'utf8',
    ),
  );
  await prepareUser(models, userRootData);
};

const createGroups = async () => {
  await models.Group.create({
    _id: UUID(),
    org_id: org01._id,
    uuid: group01Uuid,
    name: group01Name,
  });
};

const createClusters = async () => {
  await models.Cluster.create({
    org_id: org01._id,
    cluster_id: cluster01Uuid,
    groups: [
      {
        'uuid': group01Uuid,
        'name': group01Name
      }
    ],
  });
};

describe('channel remote graphql test suite', () => {
  before(async () => {
    console.log( 'Setting EXPERIMENTAL env vars' ); // IMPORTANT: Must be deleted in 'after()' to avoid impacting other tests that do not expect these vars to be set.
    process.env.EXPERIMENTAL_GITOPS = 'true';
    process.env.EXPERIMENTAL_GITOPS_ALT = 'true';

    mongoServer = new MongoMemoryServer( { binary: { version: '4.2.17' } } );
    await mongoServer.start();
    const mongoUrl = mongoServer.getUri();
    console.log(`in memory test mongodb url is ${mongoUrl}`);

    myApollo = await apollo({
      mongo_url: mongoUrl,
      graphql_port: graphqlPort,
    });

    await createOrganizations();
    await createUsers();
    await createClusters();
    await createGroups();

    userRootToken = await signInUser(models, resourceApi, userRootData);
  }); // before

  after(async () => {
    await myApollo.stop(myApollo);
    await mongoServer.stop();

    console.log( 'Deleting EXPERIMENTAL env vars' );
    delete process.env.EXPERIMENTAL_GITOPS;
    delete process.env.EXPERIMENTAL_GITOPS_ALT;
  }); // after

  it('block remote Channels if EXPERIMENTAL_GITOPS not set', async () => {
    delete process.env.EXPERIMENTAL_GITOPS;
    console.log( 'Disabled EXPERIMENTAL_GITOPS for this testcase only' );
    try {
      const result = await channelRemoteApi.addRemoteChannel(userRootToken, {
        orgId: org01._id,
        name: 'anyname',
        contentType: 'remote',
        remote: {
          remoteType: 'github',
          parameters: [],
        },
      });
      console.log( `addRemoteChannel result: ${JSON.stringify( result.data, null, 2 )}` );
      const errors = result.data.errors;

      expect(errors[0].message).to.contain('Unsupported arguments');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    } finally {
      process.env.EXPERIMENTAL_GITOPS = 'true';
    }
  });

  it('add a remote channel of remoteType github with a remote parameter', async () => {
    try {
      const result = await channelRemoteApi.addRemoteChannel(userRootToken, {
        orgId: org01._id,
        name: 'origchannelname',
        contentType: 'remote',
        remote: {
          remoteType: 'github',
          parameters: [
            {
              key: 'origchannelkey1',
              value: 'origchannelval1',
            },
          ],
        },
      });
      console.log( `addRemoteChannel result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannel = result.data.data.addChannel;

      expect(addChannel.uuid).to.be.an('string');

      // Save uuid for later use in tests
      channel01Uuid = addChannel.uuid;
      console.log( `channel created: ${channel01Uuid}` );
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get the created remote channel', async () => {
    try {
      const result = await channelRemoteApi.getRemoteChannelByUuid(userRootToken, {
        orgId: org01._id,
        uuid: channel01Uuid,
      });
      console.log( `getRemoteChannelByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const retrievedChannel = result.data.data.channel;

      expect(retrievedChannel.name).to.equal('origchannelname');
      expect(retrievedChannel.remote.remoteType).to.equal('github');
      expect(retrievedChannel.remote.parameters[0].key).to.equal('origchannelkey1');
      expect(retrievedChannel.remote.parameters[0].value).to.equal('origchannelval1');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('edit the created remote channel and change the remote parameter', async () => {
    try {
      const result = await channelRemoteApi.editRemoteChannel(userRootToken, {
        orgId: org01._id,
        uuid: channel01Uuid,
        name: 'newchannelname',
        remote: {
          parameters: [
            {
              key: 'newchannelkey1',
              value: 'newchannelval1',
            },
          ],
        },
      });
      console.log( `editRemoteChannel result: ${JSON.stringify( result.data, null, 2 )}` );
      const editChannel = result.data.data.editChannel;

      expect(editChannel.success).to.equal(true);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get the edited remote channel', async () => {
    try {
      const result = await channelRemoteApi.getRemoteChannelByUuid(userRootToken, {
        orgId: org01._id,
        uuid: channel01Uuid,
      });
      console.log( `getRemoteChannelByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const retrievedChannel = result.data.data.channel;

      expect(retrievedChannel.name).to.equal('newchannelname');
      expect(retrievedChannel.remote.remoteType).to.equal('github');
      expect(retrievedChannel.remote.parameters[0].key).to.equal('newchannelkey1');
      expect(retrievedChannel.remote.parameters[0].value).to.equal('newchannelval1');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a version under the remote channel ', async () => {
    try {
      const result = await channelRemoteApi.addRemoteChannelVersion(userRootToken, {
        orgId: org01._id,
        channelUuid: channel01Uuid,
        name: 'origvername',
        description: 'origverdesc',
        type: 'yaml',
        remote: {
          parameters: [
            {
              key: 'origverkey1',
              value: 'origverval1',
            },
          ],
        },
      });
      console.log( `addRemoteChannelVersion result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannelVersion = result.data.data.addChannelVersion;

      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // Save uuid for later use in tests
      ver01Uuid = addChannelVersion.versionUuid;
      console.log( `version created: ${ver01Uuid}` );
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a subscription to the remote channel version', async () => {
    try {
      const result = await subscriptionApi.addSubscription(userRootToken, {
        orgId: org01._id,
        channelUuid: channel01Uuid,
        versionUuid: ver01Uuid,
        name: 'remotesub1',
        groups: [group01Name],
      });
      console.log( `addSubscription result: ${JSON.stringify( result.data, null, 2 )}` );
      const addSubscription = result.data.data.addSubscription;

      expect(addSubscription.uuid).to.be.an('string');

      // Save uuid for later use in tests
      sub01Uuid = addSubscription.uuid;
      console.log( `subscription created: ${sub01Uuid}` );
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get the created remote channel version and verify values', async () => {
    try {
      const result = await channelRemoteApi.getRemoteChannelVersionByUuid(userRootToken, {
        orgId: org01._id,
        channelUuid: channel01Uuid,
        versionUuid: ver01Uuid,
      });
      console.log( `getRemoteChannelVersionByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const retrievedVersion = result.data.data.channelVersion;

      expect(retrievedVersion.name).to.equal('origvername');
      expect(retrievedVersion.remote.parameters[0].key).to.equal('origverkey1');
      expect(retrievedVersion.remote.parameters[0].value).to.equal('origverval1');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('edit the created remote channel version and change the remote parameter', async () => {
    try {
      const result = await channelRemoteApi.editRemoteChannelVersion(userRootToken, {
        orgId: org01._id,
        uuid: ver01Uuid,
        description: 'newverdesc',
        remote: {
          parameters: [
            {
              key: 'newverkey1',
              value: 'newverval1',
            },
          ],
        },
      });
      console.log( `editRemoteChannelVersion result: ${JSON.stringify( result.data, null, 2 )}` );

      const editChannelVersion = result.data.data.editChannelVersion;

      expect(editChannelVersion.success).to.equal(true);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('get the edited remote channel version and verify new values', async () => {
    try {
      const result = await channelRemoteApi.getRemoteChannelVersionByUuid(userRootToken, {
        orgId: org01._id,
        channelUuid: channel01Uuid,
        versionUuid: ver01Uuid,
      });
      console.log( `getRemoteChannelVersionByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const retrievedVersion = result.data.data.channelVersion;

      // Expect orig name but changed description and remote parameters
      expect(retrievedVersion.name).to.equal('origvername');
      expect(retrievedVersion.description).to.equal('newverdesc');
      expect(retrievedVersion.remote.parameters[0].key).to.equal('newverkey1');
      expect(retrievedVersion.remote.parameters[0].value).to.equal('newverval1');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('prevent removing the remote channel version while it has subscriptions', async () => {
    try {
      const result = await channelRemoteApi.removeRemoteChannelVersionByUuid(userRootToken, {
        orgId: org01._id,
        uuid: ver01Uuid,
        deleteSubscriptions: false,
      });
      console.log( `removeRemoteChannelVersionByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const errors = result.data.errors;

      expect(errors[0].message).to.contain('subscriptions depend on this');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('allow retrieving remote channel version subscriptions with remote parameters', async () => {
    try {
      const result = await subscriptionApi.subscriptionsByClusterId(userRootToken, {
        clusterId: cluster01Uuid
      }, org01Key);
      console.log( `subscriptionsByClusterId result: ${JSON.stringify( result.data, null, 2 )}` );
      const subscriptions = result.data.data.subscriptionsByClusterId;

      const sub01 = subscriptions.find( s => s.subscriptionUuid == sub01Uuid );
      expect(sub01).to.be.an('object');
      expect(sub01.remote).to.be.an('object');
      expect(sub01.remote.remoteType).to.equal('github');
      expect(sub01.remote.parameters.length).to.equal(2); // One from the Config merged with one from the Version
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('allow deleting the remote channel version with its subscriptions', async () => {
    try {
      const result = await channelRemoteApi.removeRemoteChannelVersionByUuid(userRootToken, {
        orgId: org01._id,
        uuid: ver01Uuid,
        deleteSubscriptions: true,
      });
      console.log( `removeRemoteChannelVersionByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const removeChannelVersion = result.data.data.removeChannelVersion;

      expect(removeChannelVersion.success).to.equal(true);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a version and subscription under the remote channel', async () => {
    try {
      const result = await channelRemoteApi.addRemoteChannelVersion(userRootToken, {
        orgId: org01._id,
        channelUuid: channel01Uuid,
        name: 'vws-name',
        description: 'version with a subscription created at the same time (vws means version with subscription)',
        type: 'yaml',
        remote: {
          parameters: [
            {
              key: 'orig-vws-key1',
              value: 'orig-vws-val1',
            },
          ],
        },
        subscriptions: [{
          name: 'vws-subscription',
          versionName: 'vws-name',
          groups: [group01Name],
        }],
      });
      console.log( `addRemoteChannelVersion result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannelVersion = result.data.data.addChannelVersion;

      expect(addChannelVersion.success).to.equal(true);
      expect(addChannelVersion.versionUuid).to.be.an('string');

      // Save uuid for later use in tests
      ver01Uuid = addChannelVersion.versionUuid;
      console.log( `version created: ${ver01Uuid}` );
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('verify subscriptions created with the version', async () => {
    try {
      const result = await subscriptionApi.subscriptionsByClusterId(userRootToken, {
        clusterId: cluster01Uuid
      }, org01Key);
      console.log( `subscriptionsByClusterId result: ${JSON.stringify( result.data, null, 2 )}` );
      const subscriptions = result.data.data.subscriptionsByClusterId;

      const sub01 = subscriptions.find( s => s.subscriptionName == 'vws-subscription' );
      expect(sub01).to.be.an('object');
      expect(sub01.remote).to.be.an('object');
      expect(sub01.remote.remoteType).to.equal('github');
      expect(sub01.remote.parameters.length).to.equal(2); // One from the Config merged with one from the Version
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('allow deleting the remote channel version and the subscriptions created at the same time', async () => {
    try {
      const result = await channelRemoteApi.removeRemoteChannelVersionByUuid(userRootToken, {
        orgId: org01._id,
        uuid: ver01Uuid,
        deleteSubscriptions: true,
      });
      console.log( `removeRemoteChannelVersionByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const removeChannelVersion = result.data.data.removeChannelVersion;

      expect(removeChannelVersion.success).to.equal(true);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('allow deleting the remote channel with no versions/subscriptions', async () => {
    try {
      const result = await channelApi.removeChannel(userRootToken, {
        orgId: org01._id,
        uuid: channel01Uuid,
      });
      console.log( `removeRemoteChannelVersionByUuid result: ${JSON.stringify( result.data, null, 2 )}` );
      const removeChannel = result.data.data.removeChannel;

      expect(removeChannel.success).to.equal(true);
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a remote channel with version and subscription', async () => {
    try {
      const result = await channelRemoteApi.addRemoteChannel(userRootToken, {
        orgId: org01._id,
        name: 'cwvs-name',
        contentType: 'remote',
        remote: {
          remoteType: 'github',
          parameters: [
            {
              key: 'orig-cwvs-channel-key1',
              value: 'orig-cwvs-channel-val1',
            },
          ],
        },
        versions: [{
          name: 'cwvs-version',
          description: 'version created at same time as channel (cwvs means channel with version and subscription)',
          type: 'yaml',
          remote: {
            parameters: [
              {
                key: 'orig-cwvs-ver-key1',
                value: 'orig-cwvs-ver-val1',
              },
            ],
          }
        }],
        subscriptions: [{
          name: 'cwvs-subscription',
          versionName: 'cwvs-version',
          groups: [group01Name],
        }],
      });
      console.log( `addRemoteChannel result: ${JSON.stringify( result.data, null, 2 )}` );
      const addChannel = result.data.data.addChannel;

      expect(addChannel.uuid).to.be.an('string');

      // Save uuid for later use in tests
      channel01Uuid = addChannel.uuid;
      console.log( `channel created: ${channel01Uuid}` );

      // Get and save uuid for later use in tests
      const sub01 = await models.Subscription.findOne( {org_id: org01._id, name: 'cwvs-subscription'} );
      sub01Uuid = sub01.uuid;
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('verify subscriptions created with the channel', async () => {
    try {
      const result = await subscriptionApi.subscriptionsByClusterId(userRootToken, {
        clusterId: cluster01Uuid
      }, org01Key);
      console.log( `subscriptionsByClusterId result: ${JSON.stringify( result.data, null, 2 )}` );
      const subscriptions = result.data.data.subscriptionsByClusterId;

      const sub01 = subscriptions.find( s => s.subscriptionName == 'cwvs-subscription' );
      expect(sub01).to.be.an('object');
      expect(sub01.remote).to.be.an('object');
      expect(sub01.remote.remoteType).to.equal('github');
      expect(sub01.remote.parameters.length).to.equal(2); // One from the Config merged with one from the Version
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('edit subscription to create a new version', async () => {
    try {
      const result = await subscriptionApi.editSubscription(userRootToken, {
        orgId: org01._id,
        uuid: sub01Uuid,
        name: 'cwvs-subscription',
        groups:[group01Name],
        channelUuid: channel01Uuid,
        version: {
          name: 'cwvs-version2',
          description: 'version created when editing subscription',
          type: 'yaml',
          remote: {
            parameters: [
              {
                key: 'orig-cwvs-ver2-key1',
                value: 'orig-cwvs-ver2-val1',
              },
            ],
          }
        },
      }, org01Key);
      console.log( `editSubscription result: ${JSON.stringify( result.data, null, 2 )}` );
      const editSubscription = result.data.data.editSubscription;

      expect(editSubscription.success).to.equal(true);

      // Get all versions
      const versions = await models.DeployableVersion.find( { org_id: org01._id } );
      // Verify just one version exists (old one was deleted)
      expect( versions.length ).to.equal(1);
      // Verify the one version is the new one
      expect( versions[0].name ).to.equal('cwvs-version2');
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('add a subscription and version under the remote channel', async () => {
    try {
      const result = await subscriptionApi.addSubscription(userRootToken, {
        orgId: org01._id,
        name: 'swv-sub-name',
        groups: [group01Name],
        channelUuid: channel01Uuid,
        version: {
          name: 'swv-ver-name',
          description: 'version created with a subscription at the same time (swv means subscription with version)',
          type: 'yaml',
          remote: {
            parameters: [
              {
                key: 'orig-swv-key1',
                value: 'orig-swv-val1',
              },
            ],
          },
        }
      });
      console.log( `addSubscription result: ${JSON.stringify( result.data, null, 2 )}` );
      const addSubscription = result.data.data.addSubscription;

      expect(addSubscription.uuid).to.be.an('string');

      // Save uuid for later use in tests
      sub01Uuid = addSubscription.uuid;
      console.log( `subscription created: ${sub01Uuid}` );
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('verify version created with the subscription', async () => {
    try {
      const result = await subscriptionApi.subscriptionsByClusterId(userRootToken, {
        clusterId: cluster01Uuid
      }, org01Key);
      console.log( `subscriptionsByClusterId result: ${JSON.stringify( result.data, null, 2 )}` );
      const subscriptions = result.data.data.subscriptionsByClusterId;

      const sub01 = subscriptions.find( s => s.subscriptionName == 'swv-sub-name' );
      expect(sub01).to.be.an('object');
      expect(sub01.remote).to.be.an('object');
      expect(sub01.remote.remoteType).to.equal('github');
      expect(sub01.remote.parameters.length).to.equal(2); // One from the Config merged with one from the Version
    } catch (error) {
      if (error.response) {
        console.error('error encountered:  ', error.response.data);
      } else {
        console.error('error encountered:  ', error);
      }
      throw error;
    }
  });

  it('allow deleting the subscription and the remote channel version at the same time', async () => {
    try {
      const result = await subscriptionApi.removeSubscription(userRootToken, {
        orgId: org01._id,
        uuid: sub01Uuid,
        deleteVersion: true,
      });
      console.log( `removeSubscription result: ${JSON.stringify( result.data, null, 2 )}` );
      const removeSubscription = result.data.data.removeSubscription;

      expect(removeSubscription.success).to.equal(true);
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
