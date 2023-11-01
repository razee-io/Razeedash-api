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
const _ = require('lodash');
const verifyAdminOrgKey = require('../../utils/orgs.js').verifyAdminOrgKey;
const { v4: uuid } = require('uuid');
const { customMetricsClient, passOperationName } = require('../../customMetricsClient'); // Add custom metrics plugin

const createOrg = async(req, res) => {
  // Capture the start time when the request starts
  const startTime = Date.now();
  // Increment API counter metric
  customMetricsClient.incrementAPICalls.inc();
  // Parse API operation name
  passOperationName('createOrg');

  const orgName = (req.body && req.body.name) ? req.body.name.trim() : null;

  if(!orgName) {
    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram.observe(durationInSeconds);
    customMetricsClient.apiCallCounter.inc({ status: 'failure' });
    req.log.warn(`An org name was not specified on route ${req.url}`);
    return res.status(400).send( 'An org name is required' );
  }

  try {
    const Orgs = req.db.collection('orgs');
    const foundOrg = await Orgs.findOne({'name': orgName});
    if(foundOrg){
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'failure' });
      req.log.warn( 'The org name already exists' );
      return res.status(400).send( 'This org already exists' );
    }

    const orgApiKey = `orgApiKey-${uuid()}`;
    const insertedOrg = await Orgs.insertOne({
      '_id': uuid(),
      'name': orgName,
      'orgKeys' : [ orgApiKey ],
      'created': new Date(),
      'updated': new Date()
    });

    if(insertedOrg.result.ok) {
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'success' });
      return res.status(200).send( insertedOrg.ops[0] );
    } else {
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'failure' });
      req.log.error(insertedOrg.result, `Could not create ${orgName} into the Orgs collection`);
      return res.status(500).send( 'Could not create the org' );
    }
  } catch (error) {
    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram.observe(durationInSeconds);
    customMetricsClient.apiCallCounter.inc({ status: 'failure' });
    req.log.error(error);
    return res.status(500).send( 'Error creating the org' );
  }
};

const getOrgs = async(req, res) => {
  // Capture the start time when the request starts
  const startTime = Date.now();
  // Increment API counter metric
  customMetricsClient.incrementAPICalls.inc();
  // Parse API operation name
  passOperationName('getChannelVersion');
  try {
    const Orgs = req.db.collection('orgs');

    let orgsQuery = {};
    if(req.query && req.query.name) {
      let orgsToSearch = [];
      if(_.isArray(req.query.name)) {
        orgsToSearch = req.query.name;     // GET api/v2/orgs?name=org1&name=org2
      } else {
        orgsToSearch.push(req.query.name); // GET api/v2/orgs?name=org1
      }
      orgsQuery.name = { $in: orgsToSearch };
    }

    const foundOrgs = await Orgs.find(orgsQuery).toArray();

    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram.observe(durationInSeconds);
    customMetricsClient.apiCallCounter.inc({ status: 'success' });
    return res.status(200).send( foundOrgs );
  } catch (error) {
    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram.observe(durationInSeconds);
    customMetricsClient.apiCallCounter.inc({ status: 'failure' });
    req.log.error(error);
    return res.status(500).send( 'Error searching for orgs' );
  }
};

const updateOrg = async(req, res) => {
  // Capture the start time when the request starts
  const startTime = Date.now();
  // Increment API counter metric
  customMetricsClient.incrementAPICalls.inc();
  // Parse API operation name
  passOperationName('updateOrg');

  const existingOrgId = req.params.id;
  const updates = req.body;

  if (!updates || _.isEmpty(updates)) {
    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram.observe(durationInSeconds);
    customMetricsClient.apiCallCounter.inc({ status: 'failure' });
    req.log.error('no message body was provided');
    return res.status(400).send('Missing message body');
  }

  try {
    const Orgs = req.db.collection('orgs');
    const foundOrg = await Orgs.findOne({'_id': existingOrgId});
    if(!foundOrg){
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'failure' });
      req.log.warn( 'The org was not found' );
      return res.status(400).send( 'This org was not found' );
    }

    updates.updated = new Date();
    const updatedOrg = await Orgs.updateOne({ _id: foundOrg._id }, { $set: updates } );
    if(updatedOrg.result.ok) {
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'success' });
      return res.status(200).send( 'success' );
    } else {
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'failure' });
      req.log.error(updatedOrg);
      return res.status(500).send( 'Could not update the org' );
    }
  } catch (error) {
    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram.observe(durationInSeconds);
    customMetricsClient.apiCallCounter.inc({ status: 'failure' });
    req.log.error(error);
    return res.status(500).send( 'Error updating the org' );
  }
};

const deleteOrg = async(req, res) => {
  // Capture the start time when the request starts
  const startTime = Date.now();
  // Increment API counter metric
  customMetricsClient.incrementAPICalls.inc();
  // Parse API operation name
  passOperationName('deleteOrg');

  const existingOrgId = req.params.id;
  try {
    const Orgs = req.db.collection('orgs');
    const removedOrg = await Orgs.deleteOne({ '_id': existingOrgId } );
    if(removedOrg.deletedCount) {
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'success' });
      return res.status(200).send( 'success' );
    } else {
      // Observe the duration for the histogram
      const durationInSeconds = (Date.now() - startTime) / 1000;
      customMetricsClient.apiCallHistogram.observe(durationInSeconds);
      customMetricsClient.apiCallCounter.inc({ status: 'failure' });
      req.log.error(removedOrg);
      return res.status(404).send( 'The org could not be deleted' );
    }
  } catch (error) {
    // Observe the duration for the histogram
    const durationInSeconds = (Date.now() - startTime) / 1000;
    customMetricsClient.apiCallHistogram.observe(durationInSeconds);
    customMetricsClient.apiCallCounter.inc({ status: 'failure' });
    req.log.error(error);
    return res.status(500).send( 'Error deleting the org' );
  }
};

// /api/v2/orgs
router.post('/', asyncHandler(verifyAdminOrgKey), asyncHandler(createOrg));

// /api/v2/orgs?name=firstOrg&name=AnotherOrg
router.get('/', asyncHandler(verifyAdminOrgKey), asyncHandler(getOrgs));

// /api/v2/:id
router.put('/:id', asyncHandler(verifyAdminOrgKey), asyncHandler(updateOrg));

// /api/v2/:id
router.delete('/:id', asyncHandler(verifyAdminOrgKey), asyncHandler(deleteOrg));

module.exports = router;
