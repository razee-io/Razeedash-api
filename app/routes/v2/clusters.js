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

const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const getCluster = require('../../utils/cluster.js').getCluster;
const buildSearchableDataForResource = require('../../utils/cluster.js').buildSearchableDataForResource;
const buildSearchableDataObjHash = require('../../utils/cluster.js').buildSearchableDataObjHash;
const buildPushObj = require('../../utils/cluster.js').buildPushObj;
const buildHashForResource = require('../../utils/cluster.js').buildHashForResource;

const addUpdateCluster = async (req, res, next) => {
  try {
    const Clusters = req.db.collection('clusters');
    const Stats = req.db.collection('resourceStats');
    const cluster = await Clusters.findOne({ org_id: req.org._id, cluster_id: req.params.cluster_id });
    const metadata = req.body;
    if (!cluster) {
      await Clusters.insertOne({ org_id: req.org._id, cluster_id: req.params.cluster_id, metadata, created: new Date(), updated: new Date() });
      Stats.updateOne({ org_id: req.org._id }, { $inc: { clusterCount: 1 } }, { upsert: true });
      res.status(200).send('Welcome to Razee');
    }
    else {
      if (cluster.dirty) {
        await Clusters.updateOne({ org_id: req.org._id, cluster_id: req.params.cluster_id }, { $set: { metadata, updated: new Date(), dirty: false } });
        res.status(205).send('Please resync');
      }
      else {
        await Clusters.updateOne({ org_id: req.org._id, cluster_id: req.params.cluster_id }, { $set: { metadata, updated: new Date() } });
        res.status(200).send('Thanks for the update');
      }
    }
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }
};
const pushToS3 = async (req, key, dataStr) => {
  //if its a new or changed resource, write the data out to an S3 object
  const bucket = `razee_${key.org_id}`;
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

  res.status(200).send('Thanks');
};

const updateClusterResources = async (req, res, next) => {
  try {
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

          await Resources.updateOne(key, changes, options);

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
          }
          break;
        }
        default: {
          throw new Error(`Unsupported event ${resource.type}`);
        }
      }
    }
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
    res.status(200).send(`${messageType} message received`);
  } catch (err) {
    req.log.error(err.message);
    next(err);
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

module.exports = router;
