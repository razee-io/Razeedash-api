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
const verifyAdminOrgKey = require('../../utils/orgs.js').verifyAdminOrgKey;
const _ = require('lodash');
const { customMetricsClient } = require('../../customMetricsClient'); // Add custom metrics plugin

const getResources = async (req, res, next) => {
  // Capture the start time when the request starts
  const startTime = Date.now();
  // Increment API counter metric
  customMetricsClient.apiCallsCount.inc();
  try {
    const Resources = req.db.collection('resources');
    const orgId = req.org._id + '';

    const query = { 'org_id': orgId };
    if(req.query && req.query.kind) {
      query['searchableData.kind'] = req.query.kind;
    }
    if(req.query && req.query.name) {
      query['searchableData.name'] = {$regex: req.query.name, $options: 'i',};
    }
    if(req.query && req.query.cluster_id){
      query['cluster_id'] = req.query.cluster_id;
    }

    var limit = 25;
    var skip = 0;
    if(req.query && req.query.skip) {
      skip = parseInt(req.query.skip);
    }
    if(req.query && req.query.limit){
      limit = _.clamp(parseInt(req.query.limit), 1, 10000);
    }
    var options = {
      limit, skip,
    };

    const resources = await Resources.find(query, options).toArray();

    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram('getResources').observe(durationInSeconds);
    customMetricsClient.apiCallCounter('getResources').inc({ status: 'success' });
    return res.status(200).send({
      resources,
      limit, skip,
    });
  } catch (err) {
    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram('getResources').observe(durationInSeconds);
    customMetricsClient.apiCallCounter('getResources').inc({ status: 'failure' });
    req.log.error(err.message);
    next(err);
  }
};

// /api/v2/resources?kind=Deployment&name=myResource?skip=25
router.get('/', asyncHandler(verifyAdminOrgKey), asyncHandler(getResources));

module.exports = router;
