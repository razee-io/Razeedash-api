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
const { v4: uuid } = require('uuid');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const objectHash = require('object-hash');
const _ = require('lodash');
const moment = require('moment');
const axios = require('axios');
var glob = require('glob-promise');
var fs = require('fs');
const mongoSanitize = require('express-mongo-sanitize');
const pLimit = require('p-limit');

const verifyAdminOrgKey = require('../../utils/orgs.js').verifyAdminOrgKey;
const getCluster = require('../../utils/cluster.js').getCluster;
const deleteResource = require('../../utils/resources.js').deleteResource;
const buildSearchableDataForResource = require('../../utils/cluster.js').buildSearchableDataForResource;
const buildSearchableDataObjHash = require('../../utils/cluster.js').buildSearchableDataObjHash;
const buildPushObj = require('../../utils/cluster.js').buildPushObj;
const buildHashForResource = require('../../utils/cluster.js').buildHashForResource;
const { CLUSTER_LIMITS, RESOURCE_LIMITS, CLUSTER_REG_STATES } = require('../../apollo/models/const');
const { GraphqlPubSub } = require('../../apollo/subscription');
const pubSub = GraphqlPubSub.getInstance();
const conf = require('../../conf.js').conf;
const storageFactory = require('./../../storage/storageFactory');

const addUpdateCluster = async (req, res, next) => {
  try {
    const Clusters = req.db.collection('clusters');
    const Stats = req.db.collection('resourceStats');
    const cluster = await Clusters.findOne({ org_id: req.org._id, cluster_id: req.params.cluster_id});
    const metadata = req.body;
    var reg_state = CLUSTER_REG_STATES.REGISTERED;
    if (!cluster) {
      // new cluster flow requires a cluster to be registered first.
      if (process.env.CLUSTER_REGISTRATION_REQUIRED) {
        res.status(404).send({error: 'Not found, the api requires you to register the cluster first.'});
        return;
      }
      const total = await Clusters.count({org_id:  req.org._id});
      if (total >= CLUSTER_LIMITS.MAX_TOTAL ) {
        res.status(400).send({error: 'Too many clusters are registered under this organization.'});
        return;
      }
      await Clusters.insertOne({ org_id: req.org._id, cluster_id: req.params.cluster_id, reg_state, registration: {}, metadata, created: new Date(), updated: new Date() });
      runAddClusterWebhook(req, req.org._id, req.params.cluster_id, metadata.name); // dont await. just put it in the bg
      Stats.updateOne({ org_id: req.org._id }, { $inc: { clusterCount: 1 } }, { upsert: true });
      res.status(200).send('Welcome to Razee');
    }
    else {
      if (cluster.dirty) {
        await Clusters.updateOne({ org_id: req.org._id, cluster_id: req.params.cluster_id },
          { $set: { metadata, reg_state, updated: new Date(), dirty: false } });
        res.status(205).send('Please resync');
      }
      else {
        await Clusters.updateOne({ org_id: req.org._id, cluster_id: req.params.cluster_id },
          { $set: { metadata, reg_state, updated: new Date() } });
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
    var result = await axios.post(url, {
      data: postData,
      headers,
    });
    req.log.info({ url, postData, statusCode: result.status }, 'posted add cluster webhook');
  }catch(err){
    req.log.error({ url, postData, err }, 'add cluster webhook failed');
  }
};

function pushToS3Sync(key, searchableDataHash, dataStr, data_location, logger) {
  //if its a new or changed resource, write the data out to an S3 object
  const result = {};
  const bucket = conf.storage.getResourceBucket(data_location);
  const hash = crypto.createHash('sha256');
  const keyHash = hash.update(JSON.stringify(key)).digest('hex');
  const handler = storageFactory(logger).newResourceHandler(`${keyHash}/${searchableDataHash}`, bucket, data_location);
  result.promise = handler.setData(dataStr);
  result.encodedData = handler.serialize();
  return result;
}

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

    /*
    If multiple updates to the same resource are received in the same payload,
    keep only the the last `POLLED/MODIFIED/ADDED` update.
    This is intended to limit noise from a resource that is experiencing many
    rapid updates.
    Ref: satellite-config/issues/1440
    */
    const dedupUpdates = ['POLLED','MODIFIED','ADDED'];
    for( let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      const selfLink = (resource.object.metadata && resource.object.metadata.annotations && resource.object.metadata.annotations.selfLink) ? resource.object.metadata.annotations.selfLink : resource.object.metadata.selfLink;
      const type = resource['type'] || 'other';
      // If the resource update is a de-dupable update, check to see if the same payload also includes additional de-dupable updates to the same resource.
      if( selfLink && dedupUpdates.includes(type) ) {
        // Check each of the resource updates after the current one.
        for( let j = i+1; j < resources.length; j++) {
          const checkResource = resources[j];
          const checkResourceType = checkResource['type'] || 'other';
          const checkResourceSelfLink = (checkResource.object.metadata && checkResource.object.metadata.annotations && checkResource.object.metadata.annotations.selfLink) ? checkResource.object.metadata.annotations.selfLink : checkResource.object.metadata.selfLink;
          // If the checked resource update is for the same resource (selfLink) and is a de-dupable update, remove the EARLIER update.
          if( selfLink == checkResourceSelfLink && dedupUpdates.includes(checkResourceType) ) {
            req.log.warn({ org_id: req.org._id, cluster_id: req.params.cluster_id, update_selfLink: selfLink, update_type: type }, `Duplicate update to single resource in same payload truncated` );
            resources.splice(i, 1);
            i--; // Decrement i as we just removed an item from the array.
            break; // No need to check for further resources.
          }
        }
      }
    }

    const Resources = req.db.collection('resources');
    const Stats = req.db.collection('resourceStats');

    const cluster = await req.db.collection('clusters').findOne({ org_id: req.org._id, cluster_id: clusterId});
    const data_location = cluster.registration.data_location;

    const limit = pLimit(10);
    await Promise.all(resources.map(async (resource) => {
      return limit(async () => {
        const type = resource['type'] || 'other';
        switch (type.toUpperCase()) {
          case 'POLLED':
          case 'MODIFIED':
          case 'ADDED': {
            let beginTime = Date.now();
            const resourceHash = buildHashForResource(resource.object, req.org);
            let dataStr = JSON.stringify(resource.object);
            let s3UploadWithPromiseResponse;
            let selfLink;
            if(resource.object.metadata && resource.object.metadata.annotations && resource.object.metadata.annotations.selfLink){
              selfLink = resource.object.metadata.annotations.selfLink;
            } else {
              selfLink = resource.object.metadata.selfLink;
            }
            const key = {
              org_id: req.org._id,
              cluster_id: req.params.cluster_id,
              selfLink: selfLink
            };
            let searchableDataObj = buildSearchableDataForResource(req.org, resource.object, { clusterId });

            if (searchableDataObj.kind == 'RemoteResource' && searchableDataObj.children && searchableDataObj.children.length > 0) {
              // if children arrives earlier than this RR without subscription_id, update children's subscription_id
              const childSearchKey = {
                org_id: req.org._id,
                cluster_id: req.params.cluster_id,
                selfLink: {$in: searchableDataObj.children},
                'searchableData.subscription_id': {$exists: false},
                deleted: false
              };
              let start = Date.now();
              const childResource = await Resources.findOne(childSearchKey);
              req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.findOne.childResource', 'data': childSearchKey }, 'satcon-performance');
              if (childResource) {
                const subscription_id = searchableDataObj['annotations["deploy_razee_io_clustersubscription"]'];
                req.log.debug({key, subscription_id}, `Updating children's subscription_id to ${subscription_id} for parent key.`);
                var childStart = Date.now();
                Resources.updateMany( childSearchKey,
                  {$set: {'searchableData.subscription_id': subscription_id},$currentDate: { updated: true }}, {});
                req.log.info({ 'milliseconds': Date.now() - childStart, 'operation': 'updateClusterResources:Resources.updateMany', 'data': childSearchKey }, 'satcon-performance');
              }
            }
            const rrSearchKey =  {
              org_id: req.org._id,
              cluster_id: req.params.cluster_id,
              'searchableData.kind': 'RemoteResource',
              'searchableData.children': selfLink,
              deleted: false
            };
            let start = Date.now();
            const remoteResource = await Resources.findOne(rrSearchKey);
            req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.findOne.remoteResource', 'data': rrSearchKey}, 'satcon-performance');
            if(remoteResource) {
              searchableDataObj['subscription_id'] = remoteResource.searchableData['annotations["deploy_razee_io_clustersubscription"]'];
              searchableDataObj['searchableExpression'] = searchableDataObj['searchableExpression'] + ':' + searchableDataObj['subscription_id'];
            }
            const searchableDataHash = buildSearchableDataObjHash(searchableDataObj);

            start = Date.now();
            const currentResource = await Resources.findOne(key);
            req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.findOne.currentResource', 'data': key}, 'satcon-performance');
            const hasSearchableDataChanges = (currentResource && searchableDataHash != _.get(currentResource, 'searchableDataHash'));
            const pushCmd = buildPushObj(searchableDataObj, _.get(currentResource, 'searchableData', null));
            if (!currentResource || resourceHash !== currentResource.hash) {
              let start = Date.now();
              s3UploadWithPromiseResponse = pushToS3Sync(key, searchableDataHash, dataStr, data_location, req.log);
              dataStr=s3UploadWithPromiseResponse.encodedData;
              s3UploadWithPromiseResponse.logUploadDuration = () => {req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:pushToS3Sync', 'data': key }, 'satcon-performance');};
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
                const toSet = { deleted: false, hash: resourceHash, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash };
                if(hasSearchableDataChanges) {
                  // if any of the searchable attrs has changes, then save a new yaml history obj (for diffing in the ui)
                  let start = Date.now();
                  const histId = await addResourceYamlHistObj(req, req.org._id, clusterId, selfLink, dataStr);
                  req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:addResourceYamlHistObj:hasSearchableDataChanges', 'data': clusterId}, 'satcon-performance');
                  toSet['histId'] = histId;
                }
                // if obj in db and theres changes to save
                changes = {
                  $set: toSet,
                  $currentDate: { updated: true, lastModified: true },
                  ...pushCmd
                };
              }
            }
            else{
              // adds the yaml hist item too
              let start = Date.now();
              const histId = await addResourceYamlHistObj(req, req.org._id, clusterId, selfLink, dataStr);
              req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:addResourceYamlHistObj:newResource', 'data': clusterId}, 'satcon-performance');

              // if obj not in db, then adds it
              const total = await Resources.count({org_id:  req.org._id, deleted: false});
              if (total >= RESOURCE_LIMITS.MAX_TOTAL ) {
                res.status(400).send({error: 'Too many resources are registered under this organization.'});
                return;
              }
              changes = {
                $set: { deleted: false, hash: resourceHash, histId, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash },
                $currentDate: { created: true, updated: true, lastModified: true },
                ...pushCmd
              };
              options = { upsert: true };
              start = Date.now();
              Stats.updateOne({ org_id: req.org._id }, { $inc: { deploymentCount: 1 } }, { upsert: true });
              req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Stats.updateOne', 'data': req.org._id}, 'satcon-performance');
            }

            start = Date.now();
            const result = await Resources.updateOne(key, changes, options);
            req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.updateOne.newResource', 'data': key}, 'satcon-performance');
            // publish notification to graphql
            if (result) {
              let resourceId = null;
              let resourceCreated = Date.now;
              if (result.upsertedId) {
                resourceId = result.upsertedId._id;
              } else if (currentResource) {
                resourceId = currentResource._id;
                resourceCreated = currentResource.created;
              }
              if (resourceId) {
                pubSub.resourceChangedFunc(
                  {_id: resourceId, data: dataStr, created: resourceCreated,
                    deleted: false, org_id: req.org._id, cluster_id: req.params.cluster_id, selfLink: selfLink,
                    hash: resourceHash, searchableData: searchableDataObj, searchableDataHash: searchableDataHash}, req.log);
              }
            }
            if(s3UploadWithPromiseResponse!==undefined){
              await s3UploadWithPromiseResponse.promise;
              s3UploadWithPromiseResponse.logUploadDuration();
            }
            req.log.info({ 'milliseconds': Date.now() - beginTime, 'operation': 'updateClusterResources', 'data': 'POLLED,MODIFIED,ADDED' }, 'satcon-performance');
            break;
          }
          case 'DELETED': {
            let beginTime = Date.now();
            let s3UploadWithPromiseResponse;
            let selfLink;
            if(resource.object.metadata && resource.object.metadata.annotations && resource.object.metadata.annotations.selfLink){
              selfLink = resource.object.metadata.annotations.selfLink;
            } else {
              selfLink = resource.object.metadata.selfLink;
            }
            let dataStr = JSON.stringify(resource.object);
            const key = {
              org_id: req.org._id,
              cluster_id: req.params.cluster_id,
              selfLink: selfLink
            };
            const searchableDataObj = buildSearchableDataForResource(req.org, resource.object, { clusterId });
            const searchableDataHash = buildSearchableDataObjHash(searchableDataObj);
            const currentResource = await Resources.findOne(key);
            const pushCmd = buildPushObj(searchableDataObj, _.get(currentResource, 'searchableData', null));
            let start = Date.now();
            s3UploadWithPromiseResponse = pushToS3Sync(key, searchableDataHash, dataStr, data_location, req.log);
            dataStr = s3UploadWithPromiseResponse.encodedData;
            s3UploadWithPromiseResponse.logUploadDuration = () => { req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:pushToS3Sync:Deleted', 'data': key }, 'satcon-performance'); };
            if (currentResource) {
              let start = Date.now();
              await Resources.updateOne(
                key, {
                  $set: { deleted: true, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash },
                  $currentDate: { updated: true },
                  ...pushCmd
                }
              );
              req.log.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.updateOne.Deleted:', 'data': key}, 'satcon-performance');
              await addResourceYamlHistObj(req, req.org._id, clusterId, selfLink, '');
              pubSub.resourceChangedFunc({ _id: currentResource._id, created: currentResource.created, deleted: true, org_id: req.org._id,
                cluster_id: req.params.cluster_id, selfLink: selfLink, searchableData: searchableDataObj, searchableDataHash: searchableDataHash}, req.log);
            }
            if (s3UploadWithPromiseResponse !== undefined) {
              await s3UploadWithPromiseResponse.promise;
              s3UploadWithPromiseResponse.logUploadDuration();
            }
            req.log.info({ 'milliseconds': Date.now() - beginTime, 'operation': 'updateClusterResources', 'data': 'DELETED' }, 'satcon-performance');
            break;
          }
          default: {
            throw new Error(`Unsupported event ${resource.type}`);
          }
        }
      });
    }));

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

const getClusters = async (req, res, next) => {
  try {
    const Clusters = req.db.collection('clusters');
    const orgId = req.org._id + '';
    const clusters = await Clusters.find({ 'org_id': orgId }).toArray();
    return res.status(200).send({clusters});
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }
};

const clusterDetails = async (req, res) => {
  const cluster = req.cluster; // req.cluster was set in `getCluster`
  if(cluster) {
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
    const Clusters = req.db.collection('clusters');
    const cluster_id = req.params.cluster_id;
    await Clusters.deleteOne({ org_id: req.org._id, cluster_id: cluster_id });
    req.log.info(`cluster ${cluster_id} deleted`);
    next();
  } catch (error) {
    req.log.error(error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// /api/v2/clusters/:cluster_id
router.post('/:cluster_id', mongoSanitize({ replaceWith: '_' }), asyncHandler(addUpdateCluster));

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
