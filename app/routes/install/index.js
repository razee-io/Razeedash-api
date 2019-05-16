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
const Mustache = require('mustache');
const readFile = require('fs-readfile-promise');
const request = require('request-promise-native');


const MongoClientClass = require('../../mongo/mongoClient.js');
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const mongoConf = require('../../conf.js').conf;
const MongoClient = new MongoClientClass(mongoConf); //TODO Make more dynamic

router.use(ebl(getBunyanConfig('razeedash-api/install')));

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

//Ensure we have a valid api key before doing anything on the install route
router.use(asyncHandler(async(req,res,next) => {
  const apiKey = req.query.apiKey;
  if(!apiKey){
    return res.status(403).send('Missing api key.');
  }
  const Orgs = req.db.collection('orgs');
  const org = await Orgs.findOne({
    apiKey: apiKey
  });
  if (!org) {
    return res.status(403).send('Invalid api-key.');
  }
  req.org = org;
  req.apiKey = apiKey;
  next();
}));


router.get('/inventory', asyncHandler(async(req, res, next) => {
  const apiKey = req.apiKey;
  var razeeapiUrl = `${req.protocol}://${req.get('host')}/api/v2`;
  const wk_url = 'https://github.com/razee-io/watch-keeper/releases/latest/download/resource.yaml';
  try {
    const  inventory = await readFile(`${__dirname}/inventory.yaml`,'utf8');
    const wk = await request.get(wk_url);
    const view = {
      RAZEEDASH_URL: razeeapiUrl,
      RAZEEDASH_ORG_KEY: Buffer.from(apiKey).toString('base64'),
      WATCH_KEEPER: wk
    };
    const configYaml = Mustache.render( inventory, view );
    res.setHeader('content-type', 'application/yaml');
    return res.status(200).send(configYaml);
  } catch (e) {
    req.log.error(e);
    next(e);
  }
}));


module.exports = router;
