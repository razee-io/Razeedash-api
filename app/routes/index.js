/**
* Copyright 2021 IBM Corp. All Rights Reserved.
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
const logger = bunyan.createLogger(getBunyanConfig('razeedash-api'));
const ebl = require('express-bunyan-logger');

const MongoClientClass = require('../mongo/mongoClient.js');
const conf = require('../conf.js').conf;
const S3ClientClass = require('../s3/s3Client');
const maintenanceMode = require('../utils/maintenance.js').maintenanceMode;

const MongoClient = new MongoClientClass(conf);
MongoClient.log=logger;

const getOrg = require ('../utils/orgs').getOrg;

const Kube = require('./kube/kube.js');
const Install = require('./install');
const Clusters = require('./v2/clusters.js');
const Resources = require('./v2/resources.js');
const Orgs = require('./v2/orgs.js');
const Channels = require('./v1/channels.js');

router.get('/v1/health', (req, res)=>{
  res.json({
    success: true,
    BUILD_ID: process.env.BUILD_ID || 'n/a',
    BUILD_TIME: process.env.BUILD_TIME || 'n/a',
  });
});

router.use('/kube', Kube);
router.use(ebl(getBunyanConfig('razeedash-api/api')));

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

const disableWrites = async(req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    res.status(503).send('The operation could not complete because the database is in maintenance mode.');
    return;
  }
  next();
};

if(maintenanceMode) {
  router.use(disableWrites);
}

// the orgs routes should be above the razee-org-key checks since the user
// won't have a razee-org-key when creating an org for the first time.
router.use('/v2/orgs', Orgs);

router.use((req, res, next) => {
  let orgKey = req.get('razee-org-key');
  if(!orgKey){
    orgKey = req.query.orgKey;
    if(!orgKey){
      return res.status(401).send( 'razee-org-key required' );
    }
  }
  req.orgKey=orgKey;
  next();
});
router.use(getOrg);
router.use('/install', Install);
router.use('/v2/clusters', Clusters);
router.use('/v2/resources', Resources);

router.use('/v1/channels', Channels);

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
      // users is required for stand-alone api
      users: [
        {
          keys: { 'services.bitbucket.id': 1},
          options: {sparse: true, unique: true}
        },
        {
          keys: { 'services.github.id': 1},
          options: {sparse: true, unique: true}
        },
        {
          keys: { 'services.ghe.id': 1},
          options: {sparse: true, unique: true}
        },
        {
          keys: { 'services.iam.id': 1},
          options: {sparse: true, unique: true}
        },
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
          keys: { org_id: 1, 'registration.location' : 1 },
          options: { name: 'org_id.registration_text', }
        },
        {
          keys: { org_id: 1, cluster_id: 1 },
          options: { name: 'org_id.cluster_id'}
        }
      ],
      channels: [
        {
          keys: { org_id: 1, name: 1 },
          options: { name: 'org_id.name', unique: true }
        }
      ],
      deployableVersions: [
        {
          keys: { org_id: 1, channel_id: 1, name: 1},
          options: { name: 'org_id.channel_id.name', unique: true }
        }
      ],
      groups: [
        {
          keys: { org_id: 1, name: 1 },
          options: { name: 'orgId.name', unique: true }
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
          keys: { org_id: 1, deleted: 1 },
          options: { name: 'org_id.deleted', }
        },
        {
          keys: { org_id: 1, cluster_id: 1, selfLink: 1 },
          options: { name: 'org_id.cluster_id.selfLink', }
        },
        {
          keys: { org_id: 1, cluster_id: 1, selfLink: 1, 'searchableData.subscription_id': 1, deleted: 1 },
          options: { name: 'org_id.cluster_id.subid.deleted', }
        },
        {
          keys: { org_id: 1, cluster_id: 1, 'searchableData.kind': 1, 'searchableData.children': 1, deleted: 1 },
          options: { name: 'org_id.cluster_id.subid.kind.children', }
        },
        {
          keys: { cluster_id: 1, deleted: 1 },
          options: { name: 'cluster_id.deleted', }
        },
        {
          keys: { cluster_id: 'text', selfLink: 'text', 'searchableData.searchableExpression': 'text' },
          options: { name: 'cluster_id_text_selfLink_text_searchableData.searchableExpression_text', }
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
      ],
      user_log: [
        {
          keys: { userid: 1 },
          options: { name: 'userid', }
        },
        {
          keys: { action: 1 },
          options: { name: 'action', }
        },
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

module.exports = {router, initialize };
