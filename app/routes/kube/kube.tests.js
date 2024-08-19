/* eslint-env node, mocha */
/**
 * Copyright 2024 IBM Corp. All Rights Reserved.
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

const probeUtil = require('../../utils/probes');
const defaultProbe = require('../../utils/probes/probe-default.js');

const rewire = require('rewire');
let kube = rewire('./kube');
let db = {};

describe('probes', () => {

  before(async function () {
    mongodb.max_delay = 0;
    const MongoClient = mongodb.MongoClient;
    db = await MongoClient.connect('someconnectstring', {});
    db.collection('orgs');
  });

  after(function () {
    db.close();
  });

  describe('startupProbe', () => {
    it('should pass the default startup probe after setStartupComplete is called', async () => {
      const startupHandler = kube.__get__('startupHandler');

      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/startup',
        params: {},
        log: log
      });
      const response = httpMocks.createResponse();

      // Default impl returns failure before 'setStartupComplete' is called
      await startupHandler(request, response);
      assert.equal(response.statusCode, 503);

      defaultProbe.setStartupComplete(true);

      // Default impl returns success after 'setStartupComplete' is called
      await startupHandler(request, response);
      assert.equal(response.statusCode, 200);
    });

    it('should fail if the custom startup probe fails', async () => {
      const startupHandler = kube.__get__('startupHandler');

      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/startup',
        params: {},
        log: log
      });
      const response = httpMocks.createResponse();

      // Note: default probe setStartupComplete has already been called by earlier test

      probeUtil.setImpl('./probe-testFailure.js');
      await startupHandler(request, response);

      assert.equal(response.statusCode, 503);
    });

    it('should succeed if the custom startup probe succeeds', async () => {
      const startupHandler = kube.__get__('startupHandler');

      const request = httpMocks.createRequest({
        method: 'GET',
        url: '/startup',
        params: {},
        log: log
      });
      const response = httpMocks.createResponse();

      // Note: default probe setStartupComplete has already been called by earlier test

      probeUtil.setImpl('./probe-testSuccess.js');
      await startupHandler(request, response);

      assert.equal(response.statusCode, 200);
    });
  });
});
