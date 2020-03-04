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

var _ = require('lodash');
var Redis = require('ioredis');

var inited = false;

var redisClient;
var subClient;
var chanNamesToSubs = {};

var init = ()=>{
  if(inited){
    return;
  }
  inited = true;
  redisClient = getNewClient();
  subClient = getNewClient();

  subClient.on('message', async(chanName, pubMsg)=>{
    var msg = pubMsg;
    msg = JSON.parse(msg);
    var listeners = chanNamesToSubs[chanName];
    if(!listeners){
      return;
    }
    listeners.forEach((obj)=>{
      if(!_.every(obj.filters, msg)){
        return;
      }
      obj.onMsg(msg);
    });
  });
};

var getNewClient = ()=>{
  var conf = JSON.parse(process.env.REDIS_CONN_JSON || '{}');
  return new Redis(conf);
};

var pub = async(chanName, msg)=>{
  if(!inited){
    init();
  }

  msg = JSON.stringify(msg);

  return await redisClient.publish(chanName, msg);
};

var unsub = (obj)=>{
  chanNamesToSubs[obj.chanName].delete(obj);
  if(chanNamesToSubs[obj.chanName].size < 1){
    subClient.unsubscribe(obj.chanName);
  }
};

var sub = (chanName, filters=[], onMsg=null)=>{
  if(!inited){
    init();
  }
  if(!onMsg){
    if(filters.length < 1){
      throw 'please supply (chanName, onMsg) or (chanName, filters, onMsg)';
    }
    onMsg = filters;
    filters = [];
  }
  var obj = {
    filters,
    onMsg,
    chanName,
  };
  obj.unsubscribe = ()=>{
    unsub(obj);
  };
  chanNamesToSubs[chanName] = chanNamesToSubs[chanName] || new Set();
  chanNamesToSubs[chanName].add(obj);
  subClient.subscribe(chanName);
  return obj;
};



module.exports = {
  init, pub, sub,
};
