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
const streamedRoutes = express.Router();
const asyncHandler = require('express-async-handler');

const getBunyanConfig = require('../utils/bunyan.js').getBunyanConfig;
const bunyan = require('bunyan');
const logger = bunyan.createLogger(getBunyanConfig('/'));
const ebl = require('express-bunyan-logger');

const MongoClientClass = require('../mongo/mongoClient.js');
const conf = require('../conf.js').conf;
const S3ClientClass = require('../s3/s3Client');

const MongoClient = new MongoClientClass(conf);
MongoClient.log=logger;

const getOrg = require ('../utils/orgs').getOrg;

const Kube = require('./kube/kube.js');
const Install = require('./install');
const Clusters = require('./v2/clusters.js');
const Resources = require('./v2/resources.js');
const Orgs = require('./v2/orgs.js');
const Channels = require('./v2/channels.js');
const ChannelsStream = require('./v2/channelsStream.js');
const Subscriptions = require('./v2/subscriptions.js');

router.use('/api/kube', Kube);
router.use(ebl(getBunyanConfig('/api/v2/')));

router.use(asyncHandler(async (req, res, next) => {
  const db = req.app.get('db');
  req.db = db;
  next();
}));

router.use(asyncHandler(async (req, res, next) => {
  let s3Client = null;
  if (conf.s3.endpoint) {
    s3Client = new S3ClientClass(conf);
    s3Client.log=logger;
  }
  req.s3 = s3Client;
  next();
}));

// the orgs routes should be above the razee-org-key checks since the user
// won't have a razee-org-key when creating an org for the first time. 
router.use('/api/v2/orgs', Orgs);

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
router.use('/api/v2/resources', Resources);

router.use('/api/v1/channels', Channels);
// streamedRoutes is defined so we can have a path that isn't affected by body-parser.  
// The POST route in ChannelsStream uses streams to upload to s3 and this would break
// if we applied the body-parser middelware on this route. 
streamedRoutes.use('/api/v1/channels', ChannelsStream); 
router.use('/api/v1/subscriptions', Subscriptions);

async function initialize(){
  const options = {
    'collection-indexes': {
      externalApplications: [
        { 
          keys: { org_id: 1 },
          options: { name: 'org_id', }
        },
      ],
      deployments: [
        { 
          keys: { org_id: 1 },
          options: { name: 'org_id', }
        },
        { 
          keys: { org_id: 1, 'containers.image': 1 },
          options: { name: 'org_id.containers.image', }
        }
      ],
      orgs: [
        { 
          keys: { orgKeys: 1 },
          options: { name: 'orgKeys', }
        }
      ],
      clusters: [
        { 
          keys: { org_id: 1 },
          options: { name: 'org_id', }
        },
        {
          keys: { org_id: 1, cluster_id: 1 },
          options: { name: 'org_id.cluster_id'}
        }
      ],
      resourceStats:[
        {
          keys: { org_id: 1 },
          options: { name: 'org_id', }
        }
      ],
      resources: [
        { 
          keys: { org_id: 1 },
          options: { name: 'org_id', }
        },
        { 
          keys: { org_id: 1, cluster_id: 1, selfLink: 1 },
          options: { name: 'org_id.cluster_id.selfLink', }
        },
        {
          keys: { cluster_id: 1, },
          options: { name: 'cluster_id', }
        }
      ],
      messages:[ 
        {
          keys: { org_id: 1, cluster_id: 1 },
          options: { name: 'org_id.cluster_id', }
        },
        {
          keys: { org_id: 1, cluster_id: 1, level: 1, message_hash: 1 },
          options: { name: 'org_id.cluster_id.level.message_hash', }
        }
      ]
    },
    views: [{
      name: 'clusterStatsView',
      source: 'clusters',
      pipeline: [{
        $group: {
          _id: '$org_id',
          clusterCount: {
            $sum: 1
          }
        }
      }]
    },
    {
      name:'resourceStatsView',
      source:'resources',
      pipeline:[{
        $group: {
          _id: '$org_id',
          deploymentCount: {
            $sum: 1
          }
        }
      }]
    }]};

  let db = await MongoClient.getClient(options);
  return db;
}

module.exports = {router, initialize};
