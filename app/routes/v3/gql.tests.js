/* eslint-env node, mocha */
/**
 * Copyright 2021 IBM Corp. All Rights Reserved.
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
const assert = require('assert');
const mongodb = require('mongo-mock');
const httpMocks = require('node-mocks-http');
const rewire = require('rewire');
const v3 = rewire('./gql');

let db = {};

describe('gql', () => {

  before(async function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    db = await MongoClient.connect('someconnectstring', {});
    db.collection('channels');
    db.collection('clusters');
    db.collection('deployableVersions');
    db.collection('groups');
    db.collection('subscriptions');
  });

  after(function () {
    db.close();
  });

  const restFunctions = [
    { name: 'postChannels', method: 'POST', url: '/channels', body: { name: 'testName' } },
    { name: 'getChannels', method: 'GET', url: '/channels' },
    { name: 'getChannel', method: 'GET', url: '/channels/testUuid', params: { uuid: 'testUuid' } },
    { name: 'postChannelVersion', method: 'POST', url: '/channels/testId/versions', params: { channelUuid: 'testUuid' }, body: { name: 'testName', type: 'application/json', content: 'testContent' } },
    { name: 'getChannelVersion', method: 'GET', url: '/channels/testUuid/versions/testUuid', params: { channelUuid: 'testUuid', versionUuid: 'testUuid' } },
    { name: 'getClusters', method: 'GET', url: '/clusters' },
    { name: 'getCluster', method: 'GET', url: '/clusters/testUuid', params: { clusterId: 'testUuid' } },
    { name: 'postGroups', method: 'POST', url: '/groups', body: { name: 'testName' } },
    { name: 'putGroup', method: 'PUT', url: '/groups/testUuid', params: { uuid: 'testUuid' }, body: { clusters: [] } },
    { name: 'getGroups', method: 'GET', url: '/groups' },
    { name: 'getGroup', method: 'GET', url: '/groups/testUuid', params: { uuid: 'testUuid' } },
    { name: 'postSubscriptions', method: 'POST', url: '/subscriptions', body: { name: 'testName', groups: ['testUuid'], channelUuid: 'testUuid', versionUuid: 'testUuid' } },
    { name: 'getSubscriptions', method: 'GET', url: '/subscriptions' },
    { name: 'getSubscription', method: 'GET', url: '/subscriptions/testUuid', params: { uuid: 'testUuid' } },
  ];

  restFunctions.forEach( f => {
    describe(f.name, () => {
      it( 'should return response successfully', async () => {
        // Setup
        const functionToTest = v3.__get__(f.name);
        const request = httpMocks.createRequest( {
          method: f.method,
          url: f.url,
          params: f.params || {},
          headers: {},
          orgId: 'testOrgId',
          body: f.body || {},
        });
        const response = httpMocks.createResponse();

        // Test
        try {
          await functionToTest( request, response, () => { assert.fail( 'next() was called instead of response sent' ); });
        }
        catch( e ) {
          assert.fail( `function errored instead of sending response: ${e.message}` );
        }
      } );
      if( f.params ) {
        it( 'should error if missing params', async () => {
          // Setup
          const functionToTest = v3.__get__(f.name);
          const request = httpMocks.createRequest( {
            method: f.method,
            url: f.url,
            params: {},
            headers: {},
            orgId: 'testOrgId',
            body: f.body || {},
          });
          const response = httpMocks.createResponse();

          // Test
          try {
            await functionToTest( request, response, () => { assert.fail( 'next() was called instead of response sent' ); });
            assert.fail( 'function did not error even though params were missing' );
          }
          catch( e ) {
            // Error expected
          }
        } );
      }
      if( f.body ) {
        it( 'should error if missing body attributes', async () => {
          // Setup
          const functionToTest = v3.__get__(f.name);
          const request = httpMocks.createRequest( {
            method: f.method,
            url: f.url,
            params: f.params,
            headers: {},
            orgId: 'testOrgId',
            body: {},
          });
          const response = httpMocks.createResponse();

          // Test
          try {
            await functionToTest( request, response, () => { assert.fail( 'next() was called instead of response sent' ); });
            assert.fail( 'function did not error even though body attributes were missing' );
          }
          catch( e ) {
            // Error expected
          }
        } );
      }
    } );
  } );
});
