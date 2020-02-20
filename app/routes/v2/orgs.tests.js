/* eslint-env node, mocha */
/**
 * Copyright 2019 IBM Corp. All Rights Reserved.
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
var httpMocks = require('node-mocks-http');
const log = require('../../log').log;
const uuid = require('uuid');

const rewire = require('rewire');
let v2 = rewire('./orgs');
let db = {};

describe('orgs', () => {

  before(function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    MongoClient.connect('someconnectstring', {}, function (err, database) {
      database.collection('orgs');
      db = database;
    });
  });

  after(function () {
    db.close();
  });

  describe('createOrg', () => {

    it('should retun 400 if no org name was given', async () => {
      const createOrg = v2.__get__('createOrg');
      const request = httpMocks.createRequest({ method: 'POST', url: '/', log: log, db: db });
      const response = httpMocks.createResponse();

      await createOrg(request, response);

      assert.equal(response.statusCode, 400);
    });
    it('should retun 400 if the org already exists', async () => {
      await db.collection('orgs').insertOne({ 
        '_id': '1',
        'name': 'testorg',
        'orgKeys' : [ 'test123'],
        'created': new Date(),
        'updated': new Date()
      });

      const createOrg = v2.__get__('createOrg');
      const request = httpMocks.createRequest({ 
        method: 'POST', 
        url: '/', 
        body: { name: 'testorg' },
        log: log, 
        db: db 
      });

      const response = httpMocks.createResponse();
      await createOrg(request, response);

      assert.equal(response.statusCode, 400);
    });

    it('should retun 200 if the org was created', async () => {
      const createOrg = v2.__get__('createOrg');
      const request = httpMocks.createRequest({ 
        method: 'POST', 
        url: '/', 
        body: { name: 'testorg2' },
        log: log, 
        db: db 
      });

      const response = httpMocks.createResponse();
      await createOrg(request, response);

      assert.equal(response.statusCode, 200);
    });

    it('should retun 500 if the org could not be created', async () => {
      const createOrg = v2.__get__('createOrg');
      const request = httpMocks.createRequest({ 
        method: 'POST', 
        url: '/', 
        body: { name: 'testorg2' },
        log: log
      });
      request.db = {
        collection: () => { throw new Error('oops'); }, 
        close: () => { }
      };

      const response = httpMocks.createResponse();
      await createOrg(request, response);

      assert.equal(response.statusCode, 500);
    });

  });

  describe('getOrgs', () => {

    it('should retun 200 if there were no errors ', async () => {
      await db.collection('orgs').insertOne({ 
        '_id': uuid(),
        'name': 'existingOrg',
        'orgKeys' : [ 'test123'],
        'created': new Date(),
        'updated': new Date()
      });
      const getOrgs = v2.__get__('getOrgs');
      const request = httpMocks.createRequest({ 
        method: 'POST', 
        url: '/', 
        params: { name: 'existingOrg'},
        log: log, 
        db: db 
      });

      const response = httpMocks.createResponse();
      await getOrgs(request, response);

      assert.equal(response.statusCode, 200);
    });

    it('should retun 500 if an error was thrown', async () => {
      const getOrgs = v2.__get__('getOrgs');
      const request = httpMocks.createRequest({ 
        method: 'GET', 
        url: '/', 
        body: { name: 'testorg2' },
        log: log
      });
      request.db = {
        collection: () => { throw new Error('oops'); }, 
        close: () => { }
      };

      const response = httpMocks.createResponse();
      await getOrgs(request, response);

      assert.equal(response.statusCode, 500);
    });

  });
});
