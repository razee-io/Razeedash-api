/* eslint-env node, mocha */
/* eslint no-async-promise-executor: off */
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

var rewire = require('rewire');
var events = require('events');

const { assert } = require('chai');
const chai = require('chai');
chai.use(require('chai-spies'));

var _ = require('lodash');

const sinon = require('sinon');

var SocketMock = rewire('socket.io-mock');

var socket;

var mockSubscriptions = ()=>{
};
var mockSocketIo = (server)=>{
  return server;
};

var index = rewire('./index');
index.__set__({
  Subscriptions: mockSubscriptions,
  SocketIo: mockSocketIo,
});

describe('subs', () => {
  describe('subscriptions', () =>{
    beforeEach(async() => {
      socket = new SocketMock();
      socket.disconnect = ()=>{
        _.each(socket.listeners('disconnect'), (func)=>{
          func();
        });
      };

    });

    afterEach((done)=>{
      socket.disconnect();
      sinon.restore();

      done();
    });

    it('test connection with action="subscriptions"', async () => {
      var testOrgKey = 'testOrgKey';
      _.set(socket, 'handshake.query.razee-org-key', testOrgKey);
      _.set(socket, 'handshake.query.action', 'subscriptions');

      await (new Promise(async(resolve)=>{

        index.__set__({
          Subscriptions: (orgKey, _socket)=>{
            assert(orgKey == testOrgKey);
            assert(socket == _socket);
            resolve();
          },
        });

        var mockServer = new events.EventEmitter();
        index(mockServer);
        mockServer.emit('connection', socket);
      }));
    });

    it('should disconnect if no org key specified', async()=>{
      _.set(socket, 'handshake.query.razee-org-key', '');
      _.set(socket, 'handshake.query.action', 'subscriptions');

      await (new Promise(async(resolve)=>{
        var mockServer = new events.EventEmitter();
        index(mockServer);

        var listener = mockServer.listeners('connection')[0];
        mockServer.removeListener('connection', listener);
        mockServer.on('connection', async(...args)=>{
          var result = await listener(...args);

          assert(result == false);
          resolve();
        });

        mockServer.emit('connection', socket);
      }));
    });

    it('test connection with action=null', async () => {
      var testOrgKey = 'testOrgKey';
      var action = '';
      _.set(socket, 'handshake.query.razee-org-key', testOrgKey);
      _.set(socket, 'handshake.query.action', action);

      await (new Promise(async(resolve, reject)=>{
        var mockServer = new events.EventEmitter();
        index(mockServer);

        var listener = mockServer.listeners('connection')[0];
        mockServer.removeListener('connection', listener);
        mockServer.on('connection', async(...args)=>{
          try{
            await listener(...args);
            reject('listener should have thrown an error');
          }catch(e){
            // should throw
            assert(e, `unknown socket.handshake.query['action'] "${action}"`);
            resolve();
          }
        });

        mockServer.emit('connection', socket);
      }));
    });
  });
});

