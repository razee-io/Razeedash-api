/**
 * Copyright 2020 IBM Corp. All Rights Reserved.
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

const { v4: uuid } = require('uuid');
const _ = require('lodash');
const crypto = require('crypto');
const pLimit = require('p-limit');
const mongoSanitize = require('express-mongo-sanitize');

const { GraphqlPubSub } = require('../subscription');
const { whoIs } = require ('./common');
const { buildHashForResource, buildSearchableDataForResource, buildSearchableDataObjHash, buildPushObj } = require('../../utils/cluster.js');

const { RESOURCE_LIMITS } = require('../../apollo/models/const');
const pubSub = GraphqlPubSub.getInstance();
const conf = require('../../conf.js').conf;
const storageFactory = require('./../../storage/storageFactory');


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


const resourceResolvers = {
  Mutation: {
    updateClusterResources: async(parent, { clusterId, orgId: org_id, resourceChanges }, context)=>{
      const { models, me, req_id, logger } = context;

      const org = await models.Organization.findOne({ _id: org_id });

      mongoSanitize.sanitize(resourceChanges, { replaceWith: '_' });

      const queryName = 'resourceContent';
      const changeTypes = _.uniq(_.map(resourceChanges, 'type'));
      logger.debug( {req_id, user: whoIs(me), org_id, clusterId, changeTypes, changeCount: resourceChanges.length }, `${queryName} enter`);

      const addResourceYamlHistObj = async(resourceSelfLink, yamlStr)=>{
        const id = uuid();
        const obj = {
          _id: id,
          org_id: org._id,
          cluster_id: clusterId,
          resourceSelfLink,
          yamlStr,
          updated: new Date(),
        };
        await models.ResourceYamlHist.create(obj);
        return id;
      };

      try {
        const cluster = await models.Cluster.findOne({org_id: org._id, cluster_id: clusterId }).lean({ virtuals: true });
        if(!cluster){
          throw new Error(`cluster id "${clusterId}" not found`);
        }
        const data_location = cluster.registration.data_location;

        const limit = pLimit(10);
        await Promise.all(resourceChanges.map(async (resourceChange) => {
          return limit(async () => {
            const type = resourceChange.type || 'other';
            switch (type.toUpperCase()) {
              case 'POLLED':
              case 'MODIFIED':
              case 'ADDED': {
                let beginTime = Date.now();
                const resourceHash = buildHashForResource(resourceChange.object, org);
                let dataStr = JSON.stringify(resourceChange.object);
                let s3UploadWithPromiseResponse;
                let selfLink;
                if(resourceChange.object.metadata && resourceChange.object.metadata.annotations && resourceChange.object.metadata.annotations.selfLink){
                  selfLink = resourceChange.object.metadata.annotations.selfLink;
                } else {
                  selfLink = resourceChange.object.metadata.selfLink;
                }
                const key = {
                  org_id,
                  cluster_id: clusterId,
                  selfLink: selfLink
                };
                let searchableDataObj = buildSearchableDataForResource(org, resourceChange.object, { clusterId });

                if (searchableDataObj.kind == 'RemoteResource' && searchableDataObj.children && searchableDataObj.children.length > 0) {
                  // if children arrives earlier than this RR without subscription_id, update children's subscription_id
                  const childSearchKey = {
                    org_id,
                    cluster_id: clusterId,
                    selfLink: {$in: searchableDataObj.children},
                    'searchableData.subscription_id': {$exists: false},
                    deleted: false
                  };
                  let start = Date.now();
                  const childResource = await models.Resource.findOne(childSearchKey);
                  logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.findOne.childResource', 'data': childSearchKey }, 'satcon-performance');
                  if (childResource) {
                    const subscription_id = searchableDataObj['annotations["deploy_razee_io_clustersubscription"]'];
                    logger.debug({key, subscription_id}, `Updating children's subscription_id to ${subscription_id} for parent key.`);
                    var childStart = Date.now();
                    models.Resource.updateMany( childSearchKey,
                      {$set: {'searchableData.subscription_id': subscription_id},$currentDate: { updated: true }}, {});
                    logger.info({ 'milliseconds': Date.now() - childStart, 'operation': 'updateClusterResources:Resources.updateMany', 'data': childSearchKey }, 'satcon-performance');
                  }
                }
                const rrSearchKey =  {
                  org_id,
                  cluster_id: clusterId,
                  'searchableData.kind': 'RemoteResource',
                  'searchableData.children': selfLink,
                  deleted: false
                };
                let start = Date.now();
                const remoteResource = await models.Resource.findOne(rrSearchKey);
                logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.findOne.remoteResource', 'data': rrSearchKey}, 'satcon-performance');
                if(remoteResource) {
                  searchableDataObj['subscription_id'] = remoteResource.searchableData['annotations["deploy_razee_io_clustersubscription"]'];
                  searchableDataObj['searchableExpression'] = searchableDataObj['searchableExpression'] + ':' + searchableDataObj['subscription_id'];
                }
                const searchableDataHash = buildSearchableDataObjHash(searchableDataObj);

                start = Date.now();
                const currentResource = await models.Resource.findOne(key);
                logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.findOne.currentResource', 'data': key}, 'satcon-performance');
                const hasSearchableDataChanges = (currentResource && searchableDataHash != _.get(currentResource, 'searchableDataHash'));
                const pushCmd = buildPushObj(searchableDataObj, _.get(currentResource, 'searchableData', null));
                if (!currentResource || resourceHash !== currentResource.hash) {
                  let start = Date.now();
                  s3UploadWithPromiseResponse = pushToS3Sync(key, searchableDataHash, dataStr, data_location, logger);
                  dataStr=s3UploadWithPromiseResponse.encodedData;
                  s3UploadWithPromiseResponse.logUploadDuration = () => {logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:pushToS3Sync', 'data': key }, 'satcon-performance');};
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
                      const histId = await addResourceYamlHistObj(selfLink, dataStr);
                      logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:addResourceYamlHistObj:hasSearchableDataChanges', 'data': clusterId}, 'satcon-performance');
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
                  const histId = await addResourceYamlHistObj(selfLink, dataStr);
                  logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:addResourceYamlHistObj:newResource', 'data': clusterId}, 'satcon-performance');

                  // if obj not in db, then adds it
                  const total = await models.Resource.count({org_id:  org._id, deleted: false});
                  if (total >= RESOURCE_LIMITS.MAX_TOTAL ) {
                    throw new Error('Too many resources are registered under this organization.');
                  }
                  changes = {
                    $set: { deleted: false, hash: resourceHash, histId, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash },
                    $currentDate: { created: true, updated: true, lastModified: true },
                    ...pushCmd
                  };
                  options = { upsert: true };
                  start = Date.now();
                  // we need to use table.collection.updateOne(), because mongoose doesnt let you upsert when you dont set the primary key
                  models.ResourceStat.collection.updateOne({ org_id: org._id }, { $inc: { deploymentCount: 1 } }, { upsert: true });
                  logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Stats.updateOne', 'data': org._id}, 'satcon-performance');
                }

                start = Date.now();
                const result = await models.Resource.collection.updateOne(key, changes, options);
                logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.updateOne.newResource', 'data': key}, 'satcon-performance');
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
                      {
                        _id: resourceId, data: dataStr, created: resourceCreated,
                        deleted: false, org_id: org._id, cluster_id: clusterId, selfLink: selfLink,
                        hash: resourceHash, searchableData: searchableDataObj, searchableDataHash: searchableDataHash
                      },
                      logger
                    );
                  }
                }
                if(s3UploadWithPromiseResponse!==undefined){
                  await s3UploadWithPromiseResponse.promise;
                  s3UploadWithPromiseResponse.logUploadDuration();
                }
                logger.info({ 'milliseconds': Date.now() - beginTime, 'operation': 'updateClusterResources', 'data': 'POLLED,MODIFIED,ADDED' }, 'satcon-performance');
                break;
              }
              case 'DELETED': {
                let beginTime = Date.now();
                let s3UploadWithPromiseResponse;
                let selfLink;
                if(resourceChange.object.metadata && resourceChange.object.metadata.annotations && resourceChange.object.metadata.annotations.selfLink){
                  selfLink = resourceChange.object.metadata.annotations.selfLink;
                } else {
                  selfLink = resourceChange.object.metadata.selfLink;
                }
                let dataStr = JSON.stringify(resourceChange.object);
                const key = {
                  org_id: org._id,
                  cluster_id: clusterId,
                  selfLink: selfLink
                };
                const searchableDataObj = buildSearchableDataForResource(org, resourceChange.object, { clusterId });
                const searchableDataHash = buildSearchableDataObjHash(searchableDataObj);
                const currentResource = await models.Resource.findOne(key);
                const pushCmd = buildPushObj(searchableDataObj, _.get(currentResource, 'searchableData', null));
                let start = Date.now();
                s3UploadWithPromiseResponse = pushToS3Sync(key, searchableDataHash, dataStr, data_location, logger);
                dataStr = s3UploadWithPromiseResponse.encodedData;
                s3UploadWithPromiseResponse.logUploadDuration = () => { logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:pushToS3Sync:Deleted', 'data': key }, 'satcon-performance'); };
                if (currentResource) {
                  let start = Date.now();
                  await models.Resource.updateOne(
                    key, {
                      $set: { deleted: true, data: dataStr, searchableData: searchableDataObj, searchableDataHash: searchableDataHash },
                      $currentDate: { updated: true },
                      ...pushCmd
                    }
                  );
                  logger.info({ 'milliseconds': Date.now() - start, 'operation': 'updateClusterResources:Resources.updateOne.Deleted:', 'data': key}, 'satcon-performance');
                  await addResourceYamlHistObj(selfLink, '');
                  pubSub.resourceChangedFunc({ _id: currentResource._id, created: currentResource.created, deleted: true, org_id: org._id,
                    cluster_id: clusterId, selfLink: selfLink, searchableData: searchableDataObj, searchableDataHash: searchableDataHash}, logger);
                }
                if (s3UploadWithPromiseResponse !== undefined) {
                  await s3UploadWithPromiseResponse.promise;
                  s3UploadWithPromiseResponse.logUploadDuration();
                }
                logger.info({ 'milliseconds': Date.now() - beginTime, 'operation': 'updateClusterResources', 'data': 'DELETED' }, 'satcon-performance');
                break;
              }
              default: {
                throw new Error(`Unsupported event ${resourceChange.type}`);
              }
            }
          });
        }));
        return {
          success: true,
        };
      } catch (err) {
        logger.error(err.message);
        throw err;
      }
    },
  },
};

module.exports = resourceResolvers;
