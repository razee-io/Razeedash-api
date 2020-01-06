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
const verifyAdminOrgKey = require('../../utils/orgs.js').verifyAdminOrgKey;
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;

router.use(ebl(getBunyanConfig('razeedash-api/resources')));

const getResources = async (req, res, next) => {
  try {
    const Resources = req.db.collection('resources');
    const orgId = req.org._id + '';

    const query = { 'org_id': orgId };
    if(req.query && req.query.kind) { 
      query['searchableData.kind'] = req.query.kind;
    } 
    if(req.query && req.query.name) { 
      query['searchableData.name'] = req.query.name;
    } 
    // todo add regex for name search

    const options = { 
      limit: 25,
    };
    if(req.query && req.query.skip) { 
      options['skip'] = parseInt(req.query.skip);
    } 
    console.log(query);
    console.log(options);

    const resources = await Resources.find(query, options).toArray();
    return res.status(200).send({resources});
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }
};

// get resources:  (pass in 'Kind', 'Name'(as regex) as query parameter.(optinoal) .  add pagination(25 by default)  )
// /api/v2/resources?kind=Deployment&name=myResource?skip=25
router.get('/', asyncHandler(verifyAdminOrgKey), asyncHandler(getResources));

module.exports = router;
