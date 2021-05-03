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
const { getBunyanConfig } = require('../../utils/bunyan');
const logger = bunyan.createLogger(getBunyanConfig('razeedash-api/cron/index.js'));
const { cronRotateEncKeys, migrateResourcesToNewOrgKeysCron } = require('../../utils/orgs');

// /cron/rotateEncKeys
router.get('/rotateEncKeys', asyncHandler(async(req, res)=>{
  try{
    logger.info('razeedash-api started rotateEncKeys');
    var db = req.db;
    cronRotateEncKeys({ db }); // dont await
    res.json({
      started: true,
    });
  }
  catch(err){
    logger.error(err, 'razeedash-api rotateEncKeys threw an error');
    return res.sendStatus(503);
  }
}));

// /cron/migrateResourcesToNewOrgKeys
router.get('/migrateResourcesToNewOrgKeys', asyncHandler(async(req, res)=>{
  try{
    logger.info('razeedash-api started migrateResourcesToNewOrgKeys');
    var { db, s3 } = req;
    migrateResourcesToNewOrgKeysCron({ db, s3 }); // dont await
    res.json({
      started: true,
    });
  }
  catch(err){
    logger.error(err, 'razeedash-api migrateResourcesToNewOrgKeys threw an error');
    return res.sendStatus(503);
  }
}));

module.exports = router;
