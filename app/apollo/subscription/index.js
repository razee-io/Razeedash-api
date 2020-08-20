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
const { RazeeQueryError } = require('../resolvers/common');
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
    this.initRetries = 0;
    this.enabled = false;
    this.pubSub = new PubSub();
    this.redisUrl = params.redisUrl || process.env.REDIS_PUBSUB_URL || 'redis://127.0.0.1:6379/0';
    logger.info(
      `Apollo streaming service is configured on redisUrl: ${obscureUrl(
        this.redisUrl,
      )}`,
    );
    this.init();
  }
    
  async init() {
    const url = new URL(this.redisUrl);

    if (await isPortReachable(url.port, { host: url.hostname, timeout: 5000 })) {
      this.initRetries = 0;
      const options = process.env.REDIS_CERTIFICATE_PATH
        ? { tls: { ca: [fs.readFileSync(process.env.REDIS_CERTIFICATE_PATH)] } }
        : {};
      if (this.pubSub && this.pubSub.close) {
        this.pubSub.close();
      }
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
      `Apollo streaming is not ready yet, because redis port is unreachable, will retry init in 10 seconds, already retried ${this.initRetries}.`,
    );

    if (process.env.NODE_ENV !== 'unit-test' && process.env.NODE_ENV !== 'test') {
      const instance = this;
      setTimeout( () => {
        this.initRetries++;
        instance.init();
      }, 10000);
    }
    return false;
  }

  async channelSubChangedFunc(data, context) {
    const topic = getStreamingTopic(EVENTS.CHANNEL.UPDATED, data.org_id);
    if (this.enabled) {
      try {
        logger.info({ data, topic }, 'Publishing channel subscription update');
        await this.pubSub.publish(topic, { subscriptionUpdated: { data }, });
      } catch (error) {
        logger.error(error, 'Channel subscription publish error');
        throw new RazeeQueryError('Failed to Publish subscription notification to clusters, please retry.', context);  
      }
    } else {
      logger.warn( { data, topic }, 'Failed to Publish subscription update, since pubsub is not ready.');
      throw new RazeeQueryError('Failed to Publish subscription notification to clusters, pubsub is not ready yet, please retry.', context);  
    }
    return data;
  }

  async resourceChangedFunc(resource) {
    const topic = getStreamingTopic(EVENTS.RESOURCE.UPDATED, resource.orgId);
    if (this.enabled) {
      let op = 'upsert';
      if (resource.deleted) {
        op = 'delete';
      }
      try {
        logger.debug({ op, resource, topic }, 'Publishing resource updates');
        await this.pubSub.publish(topic, {
          resourceUpdated: { resource, op },
        });
      } catch (error) {
        logger.error(error, 'Resource publish error');
        throw new RazeeQueryError('Failed to Publish resource notification, please reload the page.', context);  
      }
    } else {
      logger.warn( { resource, topic }, 'Failed to Publish resource update, since pubsub is not ready.');
      throw new RazeeQueryError('Failed to Publish resource notification, pubsub is not ready yet, please retry later.', context);  
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
