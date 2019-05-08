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
const queryBoolean = require('express-query-boolean');
const uuid = require('uuid/v4');
const _ = require('lodash');

const MongoClientClass = require('../../mongo/mongoClient.js');
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const mongoConf = require('../../conf.js').conf;
const MongoClient = new MongoClientClass(mongoConf); //TODO Make more dynamic

router.use(ebl(getBunyanConfig('razeedash-api/install')));

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

router.use( queryBoolean() );

// /install/:org_name/:org_key
router.get('/:org_name/:org_key', asyncHandler(async(req, res) => {
  const orgName = req.params.org_name;
  const orgKey = req.params.org_key;
  const isUpdate = req.query.update;

  const Orgs = req.db.collection('orgs');
  const org = await Orgs.findOne({
    name: orgName,
    apiKey: orgKey
  });

  if (!org) {
    res.status(403).send(`cluster ${orgName} not found or invalid key`);
    return;
  }

  org.base64 = function () { 
    return function ( value ) {
      return Buffer.from(Mustache.render(value, org)).toString('base64');
    };
  };

  org.isUpdate = isUpdate;
  org.uuid = uuid();

  const template = org.orgYaml;

  // if no template, returns a 404
  if(!template){
    res.status(404).send('Template not defined');
  }

  // uses vars from org and org.orgYamlCustomVars
  const vars = _.defaults({}, org, _.get(org, 'orgYamlCustomVars', {}));
  const yaml = Mustache.render( template, vars );

  res.setHeader('content-type', 'application/yaml');
  res.send( yaml );
}));

module.exports = router;
