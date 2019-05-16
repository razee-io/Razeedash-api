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

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const ebl = require('express-bunyan-logger');

const MongoClientClass = require('../../mongo/mongoClient.js');
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const mongoConf = require('../../conf.js').conf;

const MongoClient = new MongoClientClass(mongoConf); 

router.use(ebl(getBunyanConfig('razeedash-api/cron/processStats')));

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

// /cron/processStats
router.post('/processStats', asyncHandler( async(req,res,next) => {
  try {
    req.db = await MongoClient.getClient();
    const Clusters = req.db.collection('clusters');
    const Resources = req.db.collection('resources');
    const Stats = req.db.collection('resourceStats');
    
    const clusterCounts = await Clusters.aggregate([{ $group: { _id: '$org_id', clusterCount: { $sum: 1} } }]);
    clusterCounts.forEach( async (cluster) => {
      await Stats.updateOne({org_id: cluster._id}, { $set: {clusterCount: cluster.clusterCount} }, { upsert: true });
    });

    const resourceCounts = await Resources.aggregate([{ $group: { _id: '$org_id', deploymentCount: { $sum: 1} } }]);
    resourceCounts.forEach( async (resource) => {
      await Stats.updateOne({org_id: resource._id}, { $set: {deploymentCount: resource.deploymentCount} }, { upsert: true });
    });

    res.status(200).send('ok');
  } catch (error) {
    next(error);
  }
}));

module.exports = router;
