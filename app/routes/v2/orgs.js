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
const _ = require('lodash');
const verifyOrgKey = require('../../utils/orgs.js').verifyOrgKey;
const uuid = require('uuid');
const ObjectID = require('mongodb').ObjectID;


const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;

router.use(ebl(getBunyanConfig('razeedash-api/orgs')));

const createOrg = async(req, res) => {
  const orgName = (req.body && req.body.name) ? req.body.name.trim() : null;
  
  if(!orgName) {
    req.log.warn(`An org name was not specified on route ${req.url}`);
    return res.status(400).send( 'An org name is required' );
  }
  
  const Orgs = req.db.collection('orgs');
  const foundOrg = await Orgs.findOne({'name': orgName});
  if(foundOrg){
    req.log.warn( 'The org ${orgName} org already exists' );
    return res.status(400).send( 'This org already exists' );
  }

  const orgAdminKey = req.orgAdminKey; // this was set in verifyOrgKey()
  const orgApiKey = `orgApiKey-${uuid()}`;
  try {
    const insertedOrg = await Orgs.insertOne({
      'name': orgName,
      'orgKeys' : [ orgApiKey ],
      'orgAdminKey': orgAdminKey,
      'created': new Date(),
      'updated': new Date()
    });

    if(insertedOrg.result.ok) {
      return res.status(200).send( insertedOrg.ops[0] );
    } else {
      req.log.error(insertedOrg);
      return res.status(500).send( `Could not create the ${orgName} org` );
    }
  } catch (error) {
    req.log.error(error);
    return res.status(500).send( `Error creating the ${orgName} org` );
  }
};

const getOrgs = async(req, res) => {
  try {
    const Orgs = req.db.collection('orgs'); 
  
    let orgsQuery = { orgAdminKey: req.orgAdminKey };
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
    return res.status(200).send( foundOrgs );
  } catch (error) {
    req.log.error(error);
    return res.status(500).send( 'Error searching for orgs' );
  }
};

const updateOrg = async(req, res) => {
  const existingOrgId = req.params.id;
  const updates = req.body;
  
  if (!updates) {
    req.log.error('no message body was provided');
    return res.status(400).send('Missing message body');
  }
  
  try {
    const Orgs = req.db.collection('orgs');
    const foundOrg = await Orgs.findOne({'_id': ObjectID(existingOrgId)});
    if(!foundOrg){
      req.log.warn( `The org ${existingOrgId} was not found` );
      return res.status(400).send( 'This org was not found' );
    }

    updates.updated = new Date();
    const updatedOrg = await Orgs.updateOne({ _id: foundOrg._id }, { $set: updates } );
    if(updatedOrg.result.ok) {
      return res.status(200).send( 'success' );
    } else {
      req.log.error(updatedOrg);
      return res.status(500).send( 'Could not update the org' );
    }
  } catch (error) {
    req.log.error(error);
    return res.status(500).send( 'Error updating the org' );
  }
};

// /api/v2/orgs
router.post('/', asyncHandler(verifyOrgKey), asyncHandler(createOrg));

// /api/v2/orgs?name=firstOrg&name=AnotherOrg
router.get('/', asyncHandler(verifyOrgKey), asyncHandler(getOrgs));

// /api/v2/:id
router.put('/:id', asyncHandler(verifyOrgKey), asyncHandler(updateOrg));

module.exports = router;
