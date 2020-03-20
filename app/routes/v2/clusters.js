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

const crypto = require('crypto');
const uuid = require('uuid');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const ebl = require('express-bunyan-logger');
const objectHash = require('object-hash');
const _ = require('lodash');
const moment = require('moment');
const request = require('request-promise-native');
var glob = require('glob-promise');
var fs = require('fs');
const promClient = require('../../prom-client');

const verifyAdminOrgKey = require('../../utils/orgs.js').verifyAdminOrgKey;
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const getCluster = require('../../utils/cluster.js').getCluster;
const deleteResource = require('../../utils/resources.js').deleteResource;
const buildSearchableDataForResource = require('../../utils/cluster.js').buildSearchableDataForResource;
const buildSearchableDataObjHash = require('../../utils/cluster.js').buildSearchableDataObjHash;
const buildPushObj = require('../../utils/cluster.js').buildPushObj;
const buildHashForResource = require('../../utils/cluster.js').buildHashForResource;
const resourceChangedFunc = require('../../apollo/subscription/index.js').resourceChangedFunc;


const addUpdateCluster = async (req, res, next) => {
  try {
    //Get api requests latency & queue metrics
    promClient.queAddUpdateCluster.inc();
    const end = promClient.respAddUpdateCluster.startTimer();

    const Clusters = req.db.collection('clusters');
    const Stats = req.db.collection('resourceStats');
    const cluster = await Clusters.findOne({ org_id: req.org._id, cluster_id: req.params.cluster_id});
    const metadata = req.body;
    if (!cluster) {
      await Clusters.insertOne({ org_id: req.org._id, cluster_id: req.params.cluster_id, metadata, created: new Date(), updated: new Date() });
      runAddClusterWebhook(req, req.org._id, req.params.cluster_id, metadata.name); // dont await. just put it in the bg
      Stats.updateOne({ org_id: req.org._id }, { $inc: { clusterCount: 1 } }, { upsert: true });

      end({ StatusCode: '200' });    //stop the response time timer, and report the metric
      promClient.queAddUpdateCluster.dec();
      res.status(200).send('Welcome to Razee');
    }
    else {
      if (cluster.dirty) {
        await Clusters.updateOne({ org_id: req.org._id, cluster_id: req.params.cluster_id }, { $set: { metadata, updated: new Date(), dirty: false } });
        res.status(205).send('Please resync');
      }
      else {
        await Clusters.updateOne({ org_id: req.org._id, cluster_id: req.params.cluster_id }, { $set: { metadata, updated: new Date() } });

        end({ StatusCode: '200' });   //stop the response time timer, and report the metric
        promClient.queAddUpdateCluster.dec();
        res.status(200).send('Thanks for the update');
      }
    }
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }

};

var getAddClusterWebhookHeaders = async()=>{
  // loads the headers specified in the 'razeedash-add-cluster-webhook-headers-secret' secret
  // returns the key-value pairs of the secret as a js obj
  var filesDir = '/var/run/secrets/razeeio/razeedash-api/add-cluster-webhook-headers';
  var fileNames = await glob('**', {
    cwd: filesDir,
    nodir: true,
  });
  var headers = {};
  _.each(fileNames, (name)=>{
    var val = fs.readFileSync(`${filesDir}/${name}`, 'utf8');
    headers[encodeURIComponent(name)] = val;
  });
  return headers;
};

var runAddClusterWebhook = async(req, orgId, clusterId, clusterName)=>{
  var postData = {
    org_id: orgId,
    cluster_id: clusterId,
    cluster_name: clusterName,
  };
  var url = process.env.ADD_CLUSTER_WEBHOOK_URL;
  if(!url){
    return;
  }
  req.log.info({ url, postData }, 'posting add cluster webhook');
  try{
    var headers = await getAddClusterWebhookHeaders();
    var result = await request.post({
      url,
      body: postData,
      json: true,
      resolveWithFullResponse: true,
      headers,
    });
    req.log.info({ url, postData, statusCode: result.statusCode }, 'posted add cluster webhook');
  }catch(err){
    req.log.error({ url, postData, err }, 'add cluster webhook failed');
  }
};

const pushToS3 = async (req, key, dataStr) => {
  //if its a new or changed resource, write the data out to an S3 object
  const orgId = key.org_id.toLowerCase();
  const bucket = `razee-${orgId}`;
  const hash = crypto.createHash('sha256');
  const hashKey = hash.update(JSON.stringify(key)).digest('hex');
  await req.s3.createBucketAndObject(bucket, hashKey, dataStr);
  return `https://${req.s3.endpoint}/${bucket}/${hashKey}`;
};

var deleteOrgClusterResourceSelfLinks = async(req, orgId, clusterId, selfLinks)=>{
  const Resources = req.db.collection('resources');
  selfLinks = _.filter(selfLinks); // in such a case that a null is passed to us. if you do $in:[null], it returns all items missing the attr, which is not what we want
  if(selfLinks.length < 1){
    return;
  }
  if(!orgId || !clusterId){
    throw `missing orgId or clusterId: ${JSON.stringify({ orgId, clusterId })}`;
  }
  var search = {
    org_id: orgId,
    cluster_id: clusterId,
    selfLink: {
      $in: selfLinks,
    }
  };
  await Resources.deleteMany(search);
};

const syncClusterResources = async(req, res)=>{
  const orgId = req.org._id;
  const clusterId = req.params.cluster_id;
  const Resources = req.db.collection('resources');
  const Stats = req.db.collection('resourceStats');

  //Get api requests latency & queue metrics
  promClient.queSyncClusterResources.inc();
  const end = promClient.respSyncClusterResources.startTimer();

  var result = await Resources.updateMany(
    { org_id: orgId, cluster_id: clusterId, updated: { $lt: new moment().subtract(1, 'hour').toDate() }, deleted: { $ne: true} },
    { $set: { deleted: true }, $currentDate: { updated: true } },
  );
  req.log.debug({ org_id: orgId, cluster_id: clusterId }, `${result.modifiedCount} resources marked as deleted:true`);

  // deletes items >1day old
  var objsToDelete = await Resources.find(
    { org_id: orgId, cluster_id: clusterId, deleted: true, updated: { $lt: new moment().subtract(1, 'day').toDate() } },
    { projection: { selfLink: 1, updated: 1, } }
  ).toArray();

  if(objsToDelete.length > 0){
    // if we have items that were marked as deleted and havent updated in >=1day, then deletes them
    var selfLinksToDelete = _.map(objsToDelete, 'selfLink');
    req.log.info({ org_id: orgId, cluster_id: clusterId, resourceObjs: objsToDelete }, `deleting ${selfLinksToDelete.length} resource objs`);
    await deleteOrgClusterResourceSelfLinks(req, orgId, clusterId, selfLinksToDelete);

    Stats.updateOne({ org_id: orgId }, { $inc: { deploymentCount: -1 * objsToDelete.length } });
  }

  end({ StatusCode: '200' });   //stop the response time timer, and report the metric
  promClient.queSyncClusterResources.dec();
  res.status(200).send('Thanks');
};

const updateClusterResources = async (req, res, next) => {
  try {
    //Get api requests latency & queue metrics
    promClient.queUpdateClusterResources.inc();
    const end = promClient.respUpdateClusterResources.startTimer();

    var clusterId = req.params.cluster_id;
    const body = req.body;
    if (!body) {
      res.status(400).send('Missing resource body');
      return;
    }

    let resources = body;
    if (!Array.isArray(resources)) {
      resources = [body];
    }

    const Resources = req.db.collection('resources');
    const Stats = req.db.collection('resourceStats');

    for (let resource of resources) {
      const type = resource['type'] || 'other';
      switch (type.toUpperCase()) {
        case 'POLLED':
        case 'MODIFIED':
        case 'ADDED': {
          const resourceHash = buildHashForResource(resource.object, req.org);
          let dataStr = JSON.stringify(resource.object);
          const selfLink = resource.object.metadata.selfLink;
          const key = {
            org_id: req.org._id,
            cluster_id: req.params.cluster_id,
            selfLink: selfLink
          };
          const currentResource = await Resources.findOne(key);
          const searchableDataObj = buildSearchableDataForResource(req.org, resource.object);
          const searchableDataHash = buildSearchableDataObjHash(searchableDataObj);
          const hasSearchableDataChanges = (currentResource && searchableDataHash != _.get(currentResource, 'searchableDataHash'));
          const pushCmd = buildPushObj(searchableDataObj, _.get(currentResource, 'searchableData', null));
          if (req.s3 && (!currentResource || resourceHash !== currentResource.hash)) {
            dataStr = await pushToS3(req, key, dataStr);
          }
          var changes = null;
          var options = {};
          if(currentResource){
            // if obj already in db
            if (resourceHash === currentResource.hash && !hasSearchableDataChanges){
              // if obj in db and nothing has changed
              changes = {
                $set: { deleted: false },
                $currentDate: { updated: true }
              };
            }
            else{
              // if obj in db and theres changes to save
              changes = {
                $set: { deleted: false, hash: resourceHash, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash, },
                $currentDate: { updated: true },
                ...pushCmd
              };
            }
          }
          else{
            // if obj not in db, then adds it
            changes = {
              $set: { deleted: false, hash: resourceHash, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash },
              $currentDate: { created: true, updated: true },
              ...pushCmd
            };
            options = { upsert: true };
            Stats.updateOne({ org_id: req.org._id }, { $inc: { deploymentCount: 1 } }, { upsert: true });
          }

          const result = await Resources.updateOne(key, changes, options);
          // publish notification to graphql
          if (process.env.ENABLE_GRAPHQL === 'true' && result) {
            let resourceId = null;
            let resourceCreated = Date.now;
            if (result.upsertedId) {
              resourceId = result.upsertedId._id;
            } else if (currentResource) {
              resourceId = currentResource._id;
              resourceCreated = currentResource.created;
            }
            if (resourceId) {
              resourceChangedFunc(
                {_id: resourceId, data: dataStr, created: resourceCreated,
                  deleted: false, org_id: req.org._id, cluster_id: req.params.cluster_id, selfLink: selfLink,
                  hash: resourceHash, searchableData: searchableDataObj, searchableDataHash: searchableDataHash});
            }
          }

          if(hasSearchableDataChanges){
            // if any of the searchable attrs has changes, then save a new yaml history obj (for diffing in the ui)
            await addResourceYamlHistObj(req, req.org._id, clusterId, selfLink, dataStr);
          }
          break;
        }
        case 'DELETED': {
          const selfLink = resource.object.metadata.selfLink;
          let dataStr = JSON.stringify(resource.object);
          const key = {
            org_id: req.org._id,
            cluster_id: req.params.cluster_id,
            selfLink: selfLink
          };
          const searchableDataObj = buildSearchableDataForResource(req.org, resource.object);
          const searchableDataHash = buildSearchableDataObjHash(searchableDataObj);
          const currentResource = await Resources.findOne(key);
          const pushCmd = buildPushObj(searchableDataObj, _.get(currentResource, 'searchableData', null));
          if (req.s3) {
            dataStr = await pushToS3(req, key, dataStr);
          }
          if (currentResource) {
            await Resources.updateOne(
              key, {
                $set: { deleted: true, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash },
                $currentDate: { updated: true },
                ...pushCmd
              }
            );
            await addResourceYamlHistObj(req, req.org._id, clusterId, selfLink, '');
            if (process.env.ENABLE_GRAPHQL === 'true') {
              resourceChangedFunc({ _id: currentResource._id, created: currentResource.created, deleted: true, org_id: req.org._id, cluster_id: req.params.cluster_id, selfLink: selfLink, searchableData: searchableDataObj, searchableDataHash: searchableDataHash});
            }
          }
          break;
        }
        default: {
          throw new Error(`Unsupported event ${resource.type}`);
        }
      }
    }
    end({ StatusCode: '200' });   //stop the response time timer, and report the metric
    promClient.queUpdateClusterResources.dec();
    res.status(200).send('Thanks');
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }
};

var addResourceYamlHistObj = async(req, orgId, clusterId, resourceSelfLink, yamlStr)=>{
  var ResourceYamlHist = req.db.collection('resourceYamlHist');
  var id = uuid();
  var obj = {
    _id: id,
    org_id: orgId,
    cluster_id: clusterId,
    resourceSelfLink,
    yamlStr,
    updated: new Date(),
  };
  await ResourceYamlHist.insertOne(obj);
  return id;
};

const addClusterMessages = async (req, res, next) => {
  const body = req.body;
  if (!body) {
    res.status(400).send('Missing message body');
    return;
  }
  //Get api requests latency & queue metrics
  promClient.queAddClusterMessages.inc();
  const end = promClient.respAddClusterMessages.startTimer();

  const clusterId = req.params.cluster_id;
  const errorData = JSON.stringify(body.data) || undefined;
  const level = body.level;
  const message = body.message;

  let key = {};
  let data = {};
  let insertData = {};
  const messageType = 'watch-keeper';
  try {
    var messageHash = objectHash(message);
    key = {
      cluster_id: clusterId,
      org_id: req.org._id,
      level: level,
      data: errorData,
      message_hash: messageHash,
    };
    data = {
      level: level,
      message: message,
      data: errorData,
      updated: new Date(),
    };
    insertData = {
      created: new Date(),
    };

    const Messages = req.db.collection('messages');
    await Messages.updateOne(key, { $set: data, $setOnInsert: insertData }, { upsert: true });
    req.log.debug({ messagedata: data }, `${messageType} message data posted`);

    end({ StatusCode: '200' });   //stop the response time timer, and report the metric
    promClient.queAddClusterMessages.dec();
    res.status(200).send(`${messageType} message received`);
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }
};

const getClusters = async (req, res, next) => {
  try {
    //Get api requests latency & queue metrics
    promClient.queGetClusters.inc();
    const end = promClient.respGetClusters.startTimer();

    const Clusters = req.db.collection('clusters');
    const orgId = req.org._id + '';
    const clusters = await Clusters.find({ 'org_id': orgId }).toArray();

    end({ StatusCode: '200' });   //stop the response time timer, and report the metric
    promClient.queGetClusters.dec();

    return res.status(200).send({clusters});
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }
};

const clusterDetails = async (req, res) => {
  //Get api requests latency & queue metrics
  promClient.queClusterDetails.inc();
  const end = promClient.respClusterDetails.startTimer();

  const cluster = req.cluster; // req.cluster was set in `getCluster`
  if(cluster) {
    end({ StatusCode: '200' });   //stop the response time timer, and report the metric
    promClient.queClusterDetails.dec();

    return res.status(200).send({cluster});
  } else {
    return res.status(404).send('cluster was not found');
  }
};

const deleteCluster = async (req, res, next) => {
  try {
    if(!req.org._id || !req.params.cluster_id){
      throw 'missing orgId or clusterId';
    }
    //Get api requests latency & queue metrics
    promClient.queDeleteCluster.inc();
    const end = promClient.respDeleteCluster.startTimer();

    const Clusters = req.db.collection('clusters');
    const cluster_id = req.params.cluster_id;
    await Clusters.deleteOne({ org_id: req.org._id, cluster_id: cluster_id });
    req.log.info(`cluster ${cluster_id} deleted`);

    end({ StatusCode: '200' });   //stop the response time timer, and report the metric
    promClient.queDeleteCluster.dec();

    next();
  } catch (error) {
    req.log.error(error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

router.use(ebl(getBunyanConfig('razeedash-api/clusters')));

// /api/v2/clusters/:cluster_id
router.post('/:cluster_id', asyncHandler(addUpdateCluster));

// /api/v2/clusters/:cluster_id/resources
router.post('/:cluster_id/resources', asyncHandler(getCluster), asyncHandler(updateClusterResources));

// /api/v2/clusters/:cluster_id/resources/sync
router.post('/:cluster_id/resources/sync', asyncHandler(getCluster), asyncHandler(syncClusterResources));

// /api/v2/clusters/:cluster_id/messages
router.post('/:cluster_id/messages', asyncHandler(getCluster), asyncHandler(addClusterMessages));

// /api/v2/clusters
router.get('/', asyncHandler(verifyAdminOrgKey), asyncHandler(getClusters));

// /api/v2/clusters/:cluster_id
router.get('/:cluster_id', asyncHandler(verifyAdminOrgKey), asyncHandler(getCluster), asyncHandler(clusterDetails));

// /api/v2/clusters/:cluster_id
router.delete('/:cluster_id', asyncHandler(verifyAdminOrgKey), asyncHandler(getCluster), asyncHandler(deleteCluster), asyncHandler(deleteResource));

module.exports = router;
