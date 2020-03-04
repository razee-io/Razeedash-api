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
var uuid = require('uuid').v4;

const { assert } = require('chai');
const chai = require('chai');
chai.use(require('chai-spies'));

var _ = require('lodash');

const sinon = require('sinon');

var mongodb = require('mongo-mock');
var SocketMock = rewire('socket.io-mock');

var db;
var socket;
var fakeUrls = [ 'api/v1/channels/someChan/someId' ];

var orgId = 'testOrgId';
var orgKey = 'testOrgKey';

var subMock = ()=>{
  return {
    unsubscribe(){ }
  };
};

var mockMongoClient = {
  getClient(){
    return db;
  }
};

var mockGetSubscriptionUrls = async()=>{
  return fakeUrls;
};

var subscriptions = rewire('./subscriptions');

describe('subs', () => {
  describe('subscriptions', () =>{
    beforeEach(async() => {
      subscriptions.__set__({
        sub: subMock,
        MongoClient: mockMongoClient,
        getSubscriptionUrls: mockGetSubscriptionUrls,
      });

      socket = new SocketMock();
      socket.disconnect = ()=>{
        _.each(socket.listeners('disconnect'), (func)=>{
          func();
        });
      };

      mongodb.max_delay = 0;
      var MongoClient = mongodb.MongoClient;
      db = await MongoClient.connect(`someconnectstring-${uuid()}`, {});

      var Orgs = db.collection('orgs');
      var docs = [
        {
          _id: orgId,
          orgKeys: [ orgKey ],
        }
      ];
      await Orgs.insertMany(docs);

      var Subscriptions = db.collection('subscriptions');

      Subscriptions.aggregate = ()=>{
        return {
          toArray:()=>{
            return [
              {
                '_id' : 'testAggrOutputId',
                'tags' : [
                  'aaaaa'
                ],
                'channel' : 'bbbbb',
                'version' : 'asdf.yml',
                'isSubSet' : true
              }
            ];
          }
        };
      };
    });

    afterEach((done)=>{
      socket.disconnect();
      db.close();
      sinon.restore();

      done();
    });

    it('should trigger initial onMsg() and another after with no updates', async () => {
      var lastOnMsg = ()=>{
        throw 'lastOnMsg() should have been overwritten';
      };
      subscriptions.__set__({
        sub: (chanName, onMsg)=>{
          lastOnMsg = onMsg;
          return {
            unsubscribe(){},
          };
        },
      });

      _.set(socket, 'handshake.query.tags', 'aaaa,bbbb');

      var result = await (new Promise(async(resolve)=>{
        sinon.replace(socket, 'emit', (type, urls)=>{
          resolve([ type, urls ]);
        });
        var result = await subscriptions(orgKey, socket);
        assert(result, true);
      }));

      assert(result[0] == 'subscriptions');
      assert.deepEqual(result[1], fakeUrls);

      result = await lastOnMsg({ orgId });
      assert(result == false);
    });

    it('should error return false when no tagsString sent', async () => {
      _.set(socket, 'handshake.query.tags', '');

      var result = subscriptions(orgKey, socket);
      assert(result, false);
    });

    it('should error return false when invalid org key sent', async () => {
      _.set(socket, 'handshake.query.tags', 'aaaa');

      var result = subscriptions('badOrgKey', socket);
      assert(result, false);
    });

    it('should not trigger if different org sent in msg', async () => {
      _.set(socket, 'handshake.query.tags', 'aaaa,bbbb');

      var lastOnMsg = ()=>{
        throw 'lastOnMsg() should have been overwritten';
      };
      subscriptions.__set__({
        sub: (chanName, onMsg)=>{
          lastOnMsg = onMsg;
          return {
            unsubscribe(){},
          };
        },
      });

      await (new Promise(async(resolve)=>{
        sinon.replace(socket, 'emit', (type, urls)=>{
          resolve([ type, urls ]);
        });
        var result = await subscriptions(orgKey, socket);
        assert(result, true);
      }));

      var result = await lastOnMsg({ orgId: 'aDifferentOrgKey' });
      assert(result == false);
    });
  });
});

