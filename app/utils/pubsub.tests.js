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

const { assert } = require('chai');
const chai = require('chai');
chai.use(require('chai-spies'));

const sinon = require('sinon');

var redisMock = require('ioredis-mock');

var rewire = require('rewire');

var getP = ()=>{
  var resolve, reject;
  var p = new Promise((_resolve, _reject)=>{
    resolve = _resolve;
    reject = _reject;
  });
  return { p, resolve, reject };
};

var pubsub = rewire('./pubsub');
pubsub.__set__({
  Redis: redisMock,
});

// var subOnMessage = pubsub.__get__('subClient').listeners('message')[0];
//
// pubsub.__get__('redisClient').disconnect();
// pubsub.__get__('subClient').disconnect();

var pubMock;
var subMock;

describe('utils', () => {
  describe('pubsub', () =>{
    beforeEach((done) => {
      pubsub.init();
      var subOnMessage = pubsub.__get__('subClient').listeners('message')[0];
      pubMock = new redisMock({});
      subMock = pubMock.createConnectedClient();
      subMock.on('message', subOnMessage);
      pubsub.__set__({
        redisClient: pubMock,
        subClient: subMock,
      });
      done();
    });

    afterEach((done)=>{
      pubMock.disconnect();
      subMock.disconnect();
      done();
    });


    it('should trigger redis publish', async () => {
      var publishSpy = sinon.spy(pubMock, ['publish']);
      var chanName = 'blahChan1';
      var msg = { blah: 1 };
      await pubsub.pub(chanName, msg);
      var args = publishSpy.getCall(0).args;
      assert(args[0] == chanName);
      assert.deepEqual(JSON.parse(args[1]), msg);
    });

    it('should trigger redis sub callback', async () => {
      var { p, resolve } = getP();

      var chanName = 'blahChan2';
      await pubsub.sub(chanName, (subMsg)=>{
        assert.deepEqual(subMsg, msg);
        resolve();
      });
      var msg = { blah: 1 };
      await pubsub.pub(chanName, msg);

      await p;
    });

    it('should unsub', async () => {
      var { p, resolve, reject } = getP();

      var chanName = 'blahChan3';
      var sub1 = await pubsub.sub(chanName, [], (subMsg)=>{
        // we dont want to hit this one because we're going to unsub before a msg goes through
        reject(subMsg);
      });
      sub1.unsubscribe();

      await pubsub.sub(chanName, [], (subMsg)=>{
        assert.deepEqual(subMsg, msg);
        resolve();
      });
      var msg = { blah: 1 };
      await pubsub.pub(chanName, msg);

      await p;
    });
  });
});