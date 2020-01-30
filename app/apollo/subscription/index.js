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

const { getBunyanConfig } = require('../../utils/bunyan');

const logger = bunyan.createLogger(getBunyanConfig('apollo/subscription'));

const EVENTS = {
  RESOURCE: {
    UPDATED: 'RESOURCE.UPDATED',
  },
};

const pubSubPlaceHolder = {
  enabled: false,
  pubSub: new PubSub(),
};

function obscureUrl(url) {
  return url.replace(/:\/\/.*@/gi, '://xxxxxxx'.concat(':yyyyyyyy', '@'));
}

async function isRedisReachable(redisUrl) {
  const url = new URL(redisUrl);
  if (await isPortReachable(url.port, { host: url.hostname })) {
    const options = process.env.REDIS_CERTIFICATE_PATH
      ? { tls: { ca: [fs.readFileSync(process.env.REDIS_CERTIFICATE_PATH)] } }
      : {};
    pubSubPlaceHolder.pubSub = new RedisPubSub({
      publisher: new Redis(redisUrl, options),
      subscriber: new Redis(redisUrl, options),
    });
    pubSubPlaceHolder.enabled = true;
    logger.info(
      `Apollo streaming is enabled on redis endpoint ${url.hostname}:${url.port}`,
    );
    return true;
  }
  logger.warn(
    `Apollo streaming is disabled because ${url.hostname}:${url.port} is unreachable.`,
  );
  return false;
}

const redisUrl = process.env.REDIS_PUBSUB_URL || 'redis://127.0.0.1:6379/0';
if (process.env.AUTH_MODEL) {
  logger.info(
    `Apollo streaming service is configured on redisUrl: ${obscureUrl(
      redisUrl,
    )}`,
  );
  isRedisReachable(redisUrl);
}

async function resourceChangedFunc(resource) {
  if (pubSubPlaceHolder.enabled) {
    let op = 'upsert';
    if (resource.deleted) {
      op = 'delete';
    }
    try {
      logger.debug({ op, resource }, 'Publishing resource updates');
      await pubSubPlaceHolder.pubSub.publish(EVENTS.RESOURCE.UPDATED, {
        resourceUpdated: { resource, op },
      });
    } catch (error) {
      logger.error('Resource publish error:', error.stack);
    }
  }
  return resource;
}

module.exports = { EVENTS, pubSubPlaceHolder, resourceChangedFunc };
