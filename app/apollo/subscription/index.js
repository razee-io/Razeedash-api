/**
 * Copyright 2020 IBM Corp. All Rights Reserved.
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
const bunyan = require('bunyan');
const fs = require('fs');
const Redis = require('ioredis');
const { RedisPubSub } = require('graphql-redis-subscriptions');
const isPortReachable = require('is-port-reachable');
const { PubSub } = require('apollo-server');
const { APOLLO_STREAM_SHARDING } = require('../models/const');

const { getBunyanConfig } = require('../../utils/bunyan');

const logger = bunyan.createLogger(getBunyanConfig('apollo/subscription'));

const EVENTS = {
  RESOURCE: {
    UPDATED: 'APOLLO.RESOURCE.UPDATED',
  },
  CHANNEL: {
    UPDATED: 'APOLLO.CHANNEL.UPDATED',
  },
};

function obscureUrl(url) {
  return url.replace(/:\/\/.*@/gi, '://xxxxxxx'.concat(':yyyyyyyy', '@'));
}

function getStreamingTopic(prefix, org_id) {
  if (APOLLO_STREAM_SHARDING) {
    if (org_id) {
      const last2 = org_id.slice(-2);
      return `${prefix}_${last2}`;
    } 
    return `${prefix}_00`;
  }
  return prefix;
}

class PubSubImpl {
  
  constructor(params) {
    this.enabled = false;
    this.pubSub = null;
    this.redisUrl = params.redisUrl || process.env.REDIS_PUBSUB_URL || 'redis://127.0.0.1:6379/0';
    logger.info(
      `Apollo streaming service is configured on redisUrl: ${obscureUrl(
        this.redisUrl,
      )}`,
    );
    this.isRedisReachable();
  }
    
  async isRedisReachable() {
    const url = new URL(this.redisUrl);
    if (await isPortReachable(url.port, { host: url.hostname, timeout: 5000 })) {
      const options = process.env.REDIS_CERTIFICATE_PATH
        ? { tls: { ca: [fs.readFileSync(process.env.REDIS_CERTIFICATE_PATH)] } }
        : {};
      this.pubSub = new RedisPubSub({
        publisher: new Redis(this.redisUrl, options),
        subscriber: new Redis(this.redisUrl, options),
      });
      this.enabled = true;
      logger.info(
        `Apollo streaming is enabled on redis endpoint ${url.hostname}:${url.port}`,
      );
      return true;
    }
    logger.warn(
      `Apollo streaming is disabled because ${url.hostname}:${url.port} is unreachable.`,
    );
    this.enabled = false;
    this.pubSub = new PubSub();
    return false;
  }

  async channelSubChangedFunc(data) {
    if (this.enabled) {
      try {
        const topic = getStreamingTopic(EVENTS.CHANNEL.UPDATED, data.org_id);
        logger.debug({ data, topic }, 'Publishing channel subscription update');
        await this.pubSub.publish(topic, { subscriptionUpdated: { data }, });
      } catch (error) {
        logger.error(error, 'Channel subscription publish error');
      }
    }
    return data;
  }

  async resourceChangedFunc(resource) {
    if (this.enabled) {
      let op = 'upsert';
      if (resource.deleted) {
        op = 'delete';
      }
      try {
        const topic = getStreamingTopic(EVENTS.RESOURCE.UPDATED, resource.orgId);
        logger.debug({ op, resource, topic }, 'Publishing resource updates');
        await this.pubSub.publish(topic, {
          resourceUpdated: { resource, op },
        });
      } catch (error) {
        logger.error(error, 'Resource publish error');
      }
    }
    return resource;
  }
}

var GraphqlPubSub = (function() {
  var singleton;
  return {
    getInstance: function () {
      if (!singleton) {
        singleton = new PubSubImpl({});
      }
      return singleton;
    },
    deleteInstance: function () {
      if (singleton && singleton.enabled) {
        singleton.pubSub.close();
        singleton = undefined;
      }      
    }
  };
})();

module.exports = { EVENTS, GraphqlPubSub, getStreamingTopic };
