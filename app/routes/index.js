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

const getBunyanConfig = require('../utils/bunyan.js').getBunyanConfig;
const bunyan = require('bunyan');
const logger = bunyan.createLogger(getBunyanConfig('/'));
const ebl = require('express-bunyan-logger');

const MongoClientClass = require('../mongo/mongoClient.js');
const mongoConf = require('../conf.js').conf;
const MongoClient = new MongoClientClass(mongoConf);
MongoClient.log(logger);

const getOrg = require ('../utils/orgs').getOrg;

const Kube = require('./kube/kube.js');
const Install = require('./install');
const Cron = require('./cron/cron.js');
const Clusters = require('./v2/clusters.js');

router.use('/api/kube', Kube);
router.use(ebl(getBunyanConfig('/api/v2/')));

router.use(asyncHandler(async (req, res, next) => {
  const db = req.app.get('db');
  req.db = db;
  next();
}));

router.use((req, res, next) => {
  let orgKey = req.get('razee-org-key');
  if(!orgKey){
    orgKey = req.query.orgKey;
    if(!orgKey){
      req.log.warn(`razee-org-key not specified on route ${req.url}`);
      return res.status(401).send( 'razee-org-key required' );
    }
  }
  req.orgKey=orgKey;
  next();
});

router.use(getOrg);
router.use('/api/install', Install);
router.use('/api/v2/clusters', Clusters);
router.use('/api/cron', Cron);

async function initialize(){
  const options = {
    'collection-indexes': {
      deployments: [{ keys:{org_id:1, 'containers.image':1},
        options:{
          name: 'org_id.containers.image',
        }}],
      orgs: [{ keys:{apiKey:1},
        options:{
          name: 'apiKey',
        }}],
      clusters: [{keys:{org_id:1, cluster_id:1},
        options:{name: 'org_id.cluster_id'}}],
      resourceStats:[{keys: {org_id:1},
        options:{
          name: 'org_id',
        }}],
      resources: [{keys: {org_id:1, cluster_id:1, selfLink:1},
        options:{
          name: 'org_id.cluster_id.selfLink',
        }}],
      messages:[{keys: {org_id:1, cluster_id:1},
        options:{
          name: 'org_id.cluster_id',
        }},
      {keys: {org_id:1, cluster_id:1,level:1,message_hash:1},
        options:{
          name: 'org_id.cluster_id.level.message_hash',
        }}]
    }};
  let db = await MongoClient.getClient(options);
  return db;
}

module.exports = {router, initialize};
