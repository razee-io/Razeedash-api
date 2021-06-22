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
const rewire = require('rewire');
const bunyan = rewire('./log');

const responseCodeMapper = bunyan.__get__('responseCodeMapper');

describe.only('utils', () => {
  describe('bunyan', () => {
    describe('responseCodeMapper', () => {
      it('error', async () => {
        assert.equal(responseCodeMapper(500), 'error');
      });
      it('warn', async () => {
        assert.equal(responseCodeMapper(400), 'warn');
        assert.equal(responseCodeMapper(404), 'warn');
      });
      it('debug 200', async () => {
        assert.equal(responseCodeMapper(200), 'debug');
      });
      it('debug 201', async () => {
        assert.equal(responseCodeMapper(201), 'debug');
      });
    });
  });
});
