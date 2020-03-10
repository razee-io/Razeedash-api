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

const fs = require('fs');
const bunyan = require('bunyan');
var _ = require('lodash');
var Redis = require('ioredis');
const { getBunyanConfig } = require('./bunyan');
const logger = bunyan.createLogger(
  getBunyanConfig('utils/pubsub'),
);
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
  var options = {};
  // try to parse REDIS_CONN_JSON setting from the env variable
  try {
    options = JSON.parse(process.env.REDIS_CONN_JSON || '{}');
  } catch (err) {
    logger.warn(err, `Ignore the invalid REDIS_CONN_JSON setting: ${process.env.REDIS_CONN_JSON}.`);
  }

  // try to see if redis server self signed cert file exist 
  try {
    const redisCertPath = '/var/run/secrets/razeeio/razeedash-secret/redis_cert';
    if (fs.existsSync(redisCertPath)) {
      const cert = fs.readFileSync(redisCertPath);
      if ( !options.tls ) {
        options.tls = {};
      }
      options.tls.ca = [cert];
      logger.debug(`Redis server cert is successfully loaded from ${redisCertPath}`);
    } else {
      logger.debug(`Skip loading self-signed redis cert from: ${redisCertPath}`);
    }
  } catch (err) {
    logger.warn(err, `Ignore the redis server cert error.`);
  }

  // process redis url if the env variable is defined
  if (process.env.REDIS_PUBSUB_URL) {
    return new Redis(process.env.REDIS_PUBSUB_URL, options);
  }
  return new Redis(options);
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
