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
const bunyan = require('bunyan');
const express = require('express');
const asyncHandler = require('express-async-handler');
const router = express.Router();
const { GraphqlPubSub } = require('../../apollo/subscription');
const pubSub = GraphqlPubSub.getInstance();
const { getBunyanConfig } = require('../../utils/bunyan');
const logger = bunyan.createLogger(getBunyanConfig('kube/liveness'));
const timeInterval = 300000; //5 mintues

// /kube/liveness
const kube = router.get('/liveness', asyncHandler(async(req, res) => {
  // does a db call to make sure we didnt disconnect
  await require('../../apollo/models').models.Cluster.find({}, { _id:1 }, { limit:1 });

  // TODO: not real pub-sub liveness test yet, will add later
  if (pubSub.initRetries > 5) {
    // if the remote redis is not ready after 5 initial retries, then
    // it is better to restart this pod, return 500 error
    logger.error('Razeedash Api is down due to Redis pubsub connection issue, please check logs.');
    return res.sendStatus(503);
  }
  
  if (pubSub.lastPubSubMessage !== null && Date.now()- pubSub.lastPubSubMessage.time > timeInterval) {
    // check if the most recent message received is within ${timeInterval/60000} minitue
    logger.error(`Razeedash Api is down, haven't received any published messages within ${timeInterval/60000} minitue, please check logs.`);
    return res.sendStatus(503);
  }
  return res.sendStatus(200);
}));

module.exports = kube;
