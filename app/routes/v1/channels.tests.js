/* eslint-env node, mocha */
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
const assert = require('assert');
const mongodb = require('mongo-mock');
const httpMocks = require('node-mocks-http');
const log = require('../../log').log;

const rewire = require('rewire');
const v1 = rewire('./channels');

let db = {};

describe('channels', () => {

  before(async function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    db = await MongoClient.connect('someconnectstring', {});
    db.collection('orgs');
    db.collection('channels');
    db.collection('deployableVersions');
  });

  after(function () {
    db.close();
  });

  describe('getChannelVersion', () => {
    it('should return status 200 and correctly decrypted content', async () => {

      const channel_uuid = 'testChannelUuid';
      const channel_name = 'testChannelName';
      const version_uuid = 'testVersionUuid';
      const org_id = 'testOrgUuid';

      const Organizations = db.collection('orgs');
      await Organizations.insertOne( {
        '_id': org_id,
        'name': 'testOrgName',
        'orgKeys': [
          'orgApiKey-3dca21ed-addc-4ade-a1da-ad983625663e'
        ],
        'orgKeys2': [],
      });
      const Channels = db.collection('channels');
      await Channels.insertOne( {
        '_id': channel_uuid,
        'org_id': org_id,
        'name': channel_name,
        'uuid': channel_uuid,
        'data_location': 'testlocation',
        'ownerId': 'testowner',
        'kubeOwnerId': null,
        'versions': [
          {
            'uuid': version_uuid,
            'name': 'testVer',
            'description': '',
          },
        ],
      });
      const Versions = db.collection('deployableVersions');
      await Versions.insertOne( {
        org_id: org_id,
        uuid: version_uuid,
        channel_name: channel_name,
        channel_id: channel_uuid,
        content: {
          metadata: {
            type: 'embedded'
          },
          data: 'U2FsdGVkX18pT4gEiKiixXNzuUqw4gpx8ob0dkvaovAuGMynzlshVQG058ilo+q+MZOnCW2NB/i4mGSR6EU3ds0vJRi/K9eUJXnOamzDWaXs/EQ+JS+KfA5Nin3RFNnhTuIxLYMOuDbU/7gC7fy9HfKL3VyLCyfcPkLcFQeoC7PedwnOJmY+2wDogRXVOCHMU/4rExXpE5i2a6JH0w9gGw=='
        }
      });
      /*
      'U2FSdG....' is this string, encrypted by OrgKey 'orgApiKey-3dca21ed-addc-4ade-a1da-ad983625663e':
      { "apiVersion": "v1","kind": "ConfigMap","name": "testver1-configmap","namespace": "default","data": {"DUMMYKEY": "encrypted-string"}}
      */

      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/',
        org: { _id: org_id, orgKeys: ['orgApiKey-3dca21ed-addc-4ade-a1da-ad983625663e'] },
        params: {
          channelName: channel_name,
          versionId: version_uuid
        },
        headers: { 'razee-org-key': 'goodKey123' },
        log: log,
        db: db
      });
      const response = httpMocks.createResponse();

      const getChannelVersion = v1.__get__('getChannelVersion');
      await getChannelVersion(request, response);

      assert.equal( response.statusCode, 200 );
      const responseData = response._getData();
      console.log( `getChannelVersion response: ${responseData}` );
      const configMap = JSON.parse( responseData );
      assert.equal( configMap.kind, 'ConfigMap', 'response was not the expected ConfigMap' );
      assert.equal( configMap.name, 'testver1-configmap', 'response was not the expected ConfigMap name' );
    });
  }); // End getChannelVersion
});
