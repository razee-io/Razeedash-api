/**
* Copyright 2021, 2022 IBM Corp. All Rights Reserved.
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

const { createLogger, createExpressLogger } = require('../log');
const logger = createLogger('razeedash-api');

const MongoClientClass = require('../mongo/mongoClient.js');
const conf = require('../conf.js').conf;
const { maintenanceMode, maintenanceMessage } = require('../utils/maintenance.js');

const MongoClient = new MongoClientClass(conf);
MongoClient.log=logger;

const getOrg = require ('../utils/orgs').getOrg;

const Kube = require('./kube/kube.js');
const Install = require('./install');
const Clusters = require('./v2/clusters.js');
const Resources = require('./v2/resources.js');
const Orgs = require('./v2/orgs.js');
const Channels = require('./v1/channels.js');
const SystemSubscriptions = require('./v1/systemSubscriptions.js');
const V3Gql = require('./v3/gql');

router.get('/v1/health', (req, res)=>{
  res.json({
    success: true,
    BUILD_ID: process.env.BUILD_ID || 'n/a',
    BUILD_TIME: process.env.BUILD_TIME || 'n/a',
  });
});

router.use('/kube', Kube);
router.use(createExpressLogger('razeedash-api/api'));

router.use(asyncHandler(async (req, res, next) => {
  const db = req.app.get('db');
  req.db = db;
  next();
}));

const maintenanceCheck = (flag, key) => {
  return async function(req, res, next) {
    // allow mongo queries to continue but don't allow writes to the database
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      if(await maintenanceMode(flag, key)) {
        res.status(503).send(maintenanceMessage);
        return;
      }
    }
    next();
  };
};

if(conf.maintenance.flag && conf.maintenance.key) {
  logger.info('Adding maintenance check middleware to express routes');
  router.use(maintenanceCheck(conf.maintenance.flag, conf.maintenance.key));
}

// the orgs routes should be above the razee-org-key checks since the user
// won't have a razee-org-key when creating an org for the first time.
router.use('/v2/orgs', Orgs);

// the gql endpoints should be above the razee-org-key checks since it passes
// all headers to the graphql handler code, which then does it own auth
router.use('/v3/', V3Gql);

router.use(async (req, res, next) => {
  let orgKey = req.get('razee-org-key');
  if(!orgKey){
    orgKey = req.query.orgKey;
    if(!orgKey){
      return res.status(401).json('{"msg": "razee-org-key required"}');
    }
  }
  req.orgKey = orgKey;
  const log = req.log;
  const orgDb = req.db.collection('orgs');
  const org = await orgDb.findOne( { $or: [ { orgKeys: orgKey }, { orgKeys2.key: orgKey } ] } );
  if (org) log.fields.org_id = org._id;
  next();
});


router.use(getOrg);
router.use('/install', Install);
router.use('/v2/clusters', Clusters);
router.use('/v2/resources', Resources);

// Channels handles only GET /:channelName/:versionId, all other /channels requests are handled by V1Gql
router.use('/v1/channels', Channels);
router.use('/v1/systemSubscriptions', SystemSubscriptions);


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
        },
        {
          keys: { 'content.data.bucketName': 1, 'content.data.path': 1},
          options: { name: 'bucketName.path' }
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
          keys: { 'searchableData.subscription_id': 1},
          options: { name: 'searchableData.subscription_id', }
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
        },
        {
          keys: { 'data.data.bucketName': 1, 'data.data.path': 1},
          options: { name: 'bucketName.path' }
        }
      ],
      resourceYamlHist:[
        {
          keys: { org_id: 1, cluster_id: 1, resourceSelfLink: 1 },
          options: { name: 'main-search', }
        },
        {
          keys: { 'yamlStr.data.bucketName': 1, 'yamlStr.data.path': 1},
          options: { name: 'bucketName.path' }
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
      ],
      serviceSubscriptions: [
        {
          keys: { org_id: 1 },
          options: { name: 'org_id', }
        },
        {
          keys: { version_uuid: 1 },
          options: { name: 'version_uuid', }
        }
      ],
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
