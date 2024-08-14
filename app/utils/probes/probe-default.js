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

const Models = require('../../apollo/models');
const { GraphqlPubSub } = require('./apollo/subscription');
const pubSub = GraphqlPubSub.getInstance();
const timeInterval = 300000; //5 mintues

let STARTUP_COMPLETE = false;
async function getStartupPayload() {
  if( !STARTUP_COMPLETE ) {
    throw new Error('startup incomplete');
  }
  return('startup probe successful');
}

async function getReadinessPayload() {
  return('readiness probe successful');
}

async function getLivenessPayload() {
  // does a db call to make sure we didnt disconnect
  try {
    await Models.models.Organization.findOne({});
  } catch (err) {
    throw new Error(`Razeedash-api liveness probe failed due to a mongo connection issue: ${err.message}`);
  }

  // TODO: not real pub-sub liveness test yet, will add later
  if (pubSub.initRetries > 5) {
    // if the remote redis is not ready after 5 initial retries, then
    // it is better to restart this pod, return 500 error
    throw new Error('Razeedash-api liveness probe failed due to Redis pubsub connection issue, please check logs');
  }

  if (pubSub.lastPubSubMessage !== null && Date.now()- pubSub.lastPubSubMessage.time > timeInterval) {
    // check if the most recent message received is within ${timeInterval/60000} minitue
    throw new Error(`Razeedash-api is down, haven't received any published messages within ${timeInterval/60000} minutes, please check logs`);
  }
}

// Called from app/index.js when server is ready to receive traffic
function setStartupComplete(b) {
  STARTUP_COMPLETE = b;
}

module.exports = { getLivenessPayload, getReadinessPayload, getStartupPayload, setStartupComplete };
