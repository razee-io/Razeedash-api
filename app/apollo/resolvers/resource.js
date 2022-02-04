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

const _ = require('lodash');
const { withFilter} = require('apollo-server');
const GraphqlFields = require('graphql-fields');

const { buildSearchForResources, convertStrToTextPropsObj } = require('../utils');
const { ACTIONS, TYPES, RESOURCE_LIMITS} = require('../models/const');
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');
const { whoIs, validAuth, getAllowedGroups, getGroupConditionsIncludingEmpty, NotFoundError, BasicRazeeError, RazeeForbiddenError, RazeeQueryError } = require ('./common');
const ObjectId = require('mongoose').Types.ObjectId;
const { applyQueryFieldsToResources } = require('../utils/applyQueryFields');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const pLimit = require('p-limit');
const mongoSanitize = require('express-mongo-sanitize');

const storageFactory = require('./../../storage/storageFactory');
const {
  buildHashForResource,
  buildSearchableDataForResource,
  buildSearchableDataObjHash,
  buildPushObj
} = require('../../utils/cluster');
const {conf} = require('../../conf');
const moment = require('moment');

const pubSub = GraphqlPubSub.getInstance();

// Filters out the namespaces you dont have access to. has to get all the resources first.
const filterNamespaces = async (data, me, orgId, queryName, context) => {

  if (data.resources.length === 0) return data;
  const namespaces = data.resources.map(d => d.searchableData.namespace).filter((v, i, a) => a.indexOf(v) === i).filter(x => x);
  const deleteArray = await Promise.all(namespaces.map(async n => {
    const invalid = await validAuth(me, orgId, ACTIONS.READ, TYPES.RESOURCE, queryName, context, [n]);
    return invalid ? n : false;
  }));

  // find and push good resources to new array
  const filteredData = [];
  data.resources.map( (d, i) => {
    const findInArray = deleteArray.filter(del => del === d.searchableData.namespace).filter(x => x)[0];
    if (!findInArray) filteredData.push(data.resources[i]);
  });

  return {
    count: filteredData.length,
    totalCount: data.totalCount,
    resources: filteredData
  };
};

// This is service level search function which does not verify user tag permission
const commonResourcesSearch = async ({ orgId, context, searchFilter, limit=500, skip=0, queryFields, sort={created: -1} }) => { // eslint-disable-line
  const {  models, req_id, logger } = context;
  try {
    const resources = await models.Resource.find(searchFilter)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .lean({ virtuals: true, defaults: true })
    ;
    var count = await models.Resource.find(searchFilter).count();
    var totalCount = await models.Resource.find({ org_id: orgId, deleted: false }).count();
    return {
      count,
      totalCount,
      resources,
    };
  } catch (error) {
    logger.error(error, `commonResourcesSearch encountered an error for the request ${req_id}`);
    throw new BasicRazeeError(context.req.t('commonResourcesSearch encountered an error. {{error.message}}', {'error.message':error.message}), context);
  }
};

const commonResourceSearch = async ({ context, org_id, searchFilter, queryFields }) => {
  const { models, me, req_id, logger } = context;
  try {
    const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', 'resource.commonResourceSearch', context);

    searchFilter['deleted'] = false;
    let resource = await models.Resource.findOne(searchFilter).lean({ virtuals: true, defaults: true });

    if (!resource) return resource;

    if (queryFields['data'] && resource.data) {
      const handler = storageFactory(logger).deserialize(resource.data);
      const yaml = await handler.getData();
      resource.data = yaml;
    }

    let cluster = await models.Cluster.findOne({ org_id: org_id, cluster_id: resource.cluster_id, ...conditions}).lean({ virtuals: true });
    if (!cluster) {
      throw new RazeeForbiddenError(context.req.t('You are not allowed to access this resource due to missing cluster tag permission.'), context);
    }

    if(queryFields['cluster']) {
      cluster.name = cluster.name || (cluster.metadata||{}).name ||  (cluster.registration||{}).name  || cluster.cluster_id;
      resource.cluster = cluster;
    }
    if(queryFields['subscription'] && resource.searchableData && resource.searchableData.subscription_id) {
      var subscriptions = await models.Subscription.findOne({ uuid: resource.searchableData.subscription_id}).lean({ virtuals: true });
      resource.subscription = subscriptions;
    }

    return resource;
  } catch (error) {
    logger.error(error, `commonResourceSearch encountered an error for the request ${req_id}`);
    throw new BasicRazeeError(context.req.t('commonResourceSearch encountered an error. {{error.message}}', {'error.message':error.message}), context);
  }
};

// usage: buildSortObj([{field: 'updated', desc: true}], ['_id', 'name', 'created', 'updated'], context);
const buildSortObj = (sortArr)=>{
  var out = {};
  _.each(sortArr, (sortObj)=>{
    out[sortObj.field] = (sortObj.desc ? -1 : 1);
  });
  return out;
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

const deleteOrgClusterResourceSelfLinks = async({ models, orgId, clusterId, selfLinks })=>{
  selfLinks = _.filter(selfLinks); // in such a case that a null is passed to us. if you do $in:[null], it returns all items missing the attr, which is not what we want
  if(selfLinks.length < 1){
    return;
  }
  if(!orgId || !clusterId){
    throw new Error(`missing orgId or clusterId: ${JSON.stringify({ orgId, clusterId })}`);
  }
  const search = {
    org_id: orgId,
    cluster_id: clusterId,
    selfLink: {
      $in: selfLinks,
    }
  };
  await models.Resource.deleteMany(search);
};

const resourceResolvers = {
  Query: {
    resourcesCount: async (parent, { orgId: org_id }, context) => {
      const queryName = 'resourcesCount';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      let count = 0;
      try {
        count = await models.Resource.count({
          org_id: org_id,
          deleted: false,
        });
      } catch (error) {
        logger.error(error, 'resourcesCount encountered an error');
        throw new RazeeQueryError(context.req.t('resourcesCount encountered an error. {{error.message}}', {'error.message':error.message}), context);
      }
      return count;
    },
    resources: async (
      parent,
      { orgId, filter, fromDate, toDate, limit, skip, kinds = [], sort, subscriptionsLimit, mongoQuery },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resources';
      const { me, req_id, logger, models } = context;
      logger.debug( {req_id, user: whoIs(me), orgId, filter, fromDate, toDate, limit, queryFields }, `${queryName} enter`);

      limit = _.clamp(limit, 1, 10000);
      skip = _.clamp(skip, 0, Number.MAX_SAFE_INTEGER);

      // use service level read
      await validAuth(me, orgId, ACTIONS.SERVICELEVELREAD, TYPES.RESOURCE, queryName, context);

      sort = buildSortObj(sort);

      let searchFilter = { org_id: orgId, deleted: false, };
      if(kinds.length > 0){
        searchFilter['searchableData.kind'] = { $in: kinds };
      }
      if ((filter && filter !== '') || fromDate != null || toDate != null) {
        var props = convertStrToTextPropsObj(filter);
        var textProp = props.$text || '';
        _.assign(searchFilter, models.Resource.translateAliases(_.omit(props, '$text')));
        searchFilter = buildSearchForResources(searchFilter, textProp, fromDate, toDate, kinds);
      }
      if(mongoQuery){
        searchFilter = {
          $and: [
            searchFilter,
            mongoQuery,
          ]
        };
      }
      const resourcesResult = await commonResourcesSearch({ orgId, models, searchFilter, limit, skip, queryFields: queryFields.resources, sort, context });

      await applyQueryFieldsToResources(resourcesResult.resources, queryFields.resources, { orgId, subscriptionsLimit }, context);

      return await filterNamespaces(resourcesResult, me, orgId, queryName, context);
    },

    resourcesByCluster: async (
      parent,
      { orgId, clusterId: cluster_id, filter, limit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resourcesByCluster';
      const { me, models, req_id, logger } = context;
      logger.debug( {req_id, user: whoIs(me), orgId, filter, limit, queryFields }, `${queryName} enter`);

      limit = _.clamp(limit, 1, 10000);

      const cluster = await models.Cluster.findOne({cluster_id}).lean({ virtuals: true });
      if (!cluster) {
        // if some tag of the sub does not in user's tag list, throws an error
        throw new NotFoundError(context.req.t('Could not find the cluster for the cluster id {{cluster_id}}.', {'cluster_id':cluster_id}), context);
      }

      const allowedGroups = await getAllowedGroups(me, orgId, ACTIONS.READ, 'uuid', queryName, context);
      if (cluster.groups) {
        cluster.groups.some(group => {
          if(allowedGroups.indexOf(group.uuid) === -1) {
            // if some group of the sub does not in user's group list, throws an error
            throw new RazeeForbiddenError(context.req.t('You are not allowed to read resources due to missing permissions on cluster group {{group.name}}.', {'group.name':group.name}), context);
          }
          return false;
        });
      }

      let searchFilter = {
        org_id: orgId,
        cluster_id: cluster_id,
        deleted: false,
      };
      if (filter && filter !== '') {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      logger.debug({req_id}, `searchFilter=${JSON.stringify(searchFilter)}`);
      const resourcesResult = await commonResourcesSearch({ orgId, context, searchFilter, limit, queryFields });
      await applyQueryFieldsToResources(resourcesResult.resources, queryFields.resources, { orgId }, context);
      return await filterNamespaces(resourcesResult, me, orgId, queryName, context);
    },

    resource: async (parent, { orgId: org_id, id: _id, histId }, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resource';
      const { models, me, req_id, logger } = context;

      logger.debug( {req_id, user: whoIs(me), _id, queryFields}, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      const searchFilter = { org_id, _id: ObjectId(_id) };
      var resource = await commonResourceSearch({ context, org_id, searchFilter, queryFields });
      if(!resource){
        return null;
      }
      if(histId && histId != _id){
        var resourceYamlHistObj = await models.ResourceYamlHist.findOne({ _id: histId, org_id, resourceSelfLink: resource.selfLink }, {}, {lean:true});
        if(!resourceYamlHistObj){
          throw new NotFoundError(context.req.t('hist _id "{{histId}}" not found', {'histId':histId}), context);
        }
        resource.histId = resourceYamlHistObj._id;
        resource.data = resourceYamlHistObj.yamlStr;
        if (queryFields['data'] && resource.data) {
          const handler = storageFactory(logger).deserialize(resource.data);
          const yaml = await handler.getData();
          resource.data = yaml;
        }
        resource.updated = resourceYamlHistObj.updated;
      }
      if (!resource.histId) {
        // histId should be populated from REST api now, this is just
        // in case we need a value for un-migrated/updated resources
        resource.histId = resource._id;
      }
      return resource;
    },

    resourceByKeys: async (
      parent,
      { orgId: org_id, clusterId: cluster_id, selfLink },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resourceByKeys';
      const { me, req_id, logger } = context;

      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, selfLink, queryFields}, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      const searchFilter = { org_id, cluster_id, selfLink };
      const resource = await commonResourceSearch({ context, org_id, searchFilter, queryFields });
      if(!resource){
        return null;
      }
      if (!resource.histId) {
        // histId should be populated from REST api now, this is just
        // in case we need a value for un-migrated/updated resources
        resource.histId = resource._id;
      }
      return resource;
    },

    resourcesBySubscription: async ( parent, { orgId, subscriptionId: subscription_id}, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resourcesBySubscription';
      const {  me, models, req_id, logger } = context;

      logger.debug( {req_id, user: whoIs(me), orgId, subscription_id, queryFields}, `${queryName} enter`);

      const subscription = await models.Subscription.findOne({uuid: subscription_id}).lean({ virtuals: true });
      if (!subscription) {
        // if some tag of the sub does not in user's tag list, throws an error
        throw new NotFoundError(context.req.t('Could not find the subscription for the subscription id {{subscription_id}}.', {'subscription_id':subscription_id}), context);
      }
      const allowedGroups = await getAllowedGroups(me, orgId, ACTIONS.READ, 'name', queryName, context);
      if(subscription.groups) {
        subscription.groups.some(group => {
          if(allowedGroups.indexOf(group) === -1) {
            // if some tag of the sub does not in user's tag list, throws an error
            throw new RazeeForbiddenError(context.req.t('You are not allowed to read resources due to missing permissions on subscription group {{group}}.', {'group':group}), context);
          }
          return false;
        });
      }
      const searchFilter = { org_id: orgId, 'searchableData.subscription_id': subscription_id, deleted: false, };
      const resourcesResult = await commonResourcesSearch({ orgId, context, searchFilter, queryFields });
      await applyQueryFieldsToResources(resourcesResult.resources, queryFields.resources, { orgId }, context);
      return await filterNamespaces(resourcesResult, me, orgId, queryName, context);
    },

    resourceHistory: async(parent, { orgId: org_id, clusterId: cluster_id, resourceSelfLink, beforeDate, afterDate, limit }, context)=>{
      const { models, me, req_id, logger } = context;

      limit = _.clamp(limit, 1, 1000);

      const queryName = 'resourceHistory';
      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, resourceSelfLink, beforeDate, afterDate, limit }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', 'resource.commonResourceSearch', context);
      let cluster = await models.Cluster.findOne({ org_id: org_id, cluster_id, ...conditions}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeForbiddenError(context.req.t('You are not allowed to access this resource due to missing cluster group permission.'), context);
      }

      var searchObj = {
        org_id, cluster_id, resourceSelfLink, deleted: {$ne: true}
      };
      var updatedSearchObj = {};
      if(beforeDate){
        updatedSearchObj.$lte = beforeDate;
      }
      if(afterDate){
        updatedSearchObj.$gte = afterDate;
      }
      if(!_.isEmpty(updatedSearchObj)){
        searchObj.updated = updatedSearchObj;
      }

      const histObjs = await models.ResourceYamlHist.find(searchObj, { _id:1, updated:1 }, { limit }).lean({ virtuals: true });
      const count = await models.ResourceYamlHist.find(searchObj).count();

      return {
        count,
        items: histObjs,
      };
    },

    resourceContent: async(parent, { orgId: org_id, clusterId: cluster_id, resourceSelfLink, histId=null }, context)=>{
      const { models, me, req_id, logger } = context;

      const queryName = 'resourceContent';
      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, resourceSelfLink, histId }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', 'resource.commonResourceSearch', context);
      let cluster = await models.Cluster.findOne({ org_id: org_id, cluster_id, ...conditions}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeForbiddenError(context.req.t('You are not allowed to access this resource due to missing cluster group permission.'), context);
      }

      var getContent = async(obj)=>{
        return obj.yamlStr;
      };

      const resource = await models.Resource.findOne({ org_id, cluster_id, selfLink: resourceSelfLink },  {},  { lean:true });
      if(!resource){
        return null;
      }

      if(!histId || histId == resource._id.toString()){
        let content = resource.data;
        if ( content ) {
          const handler = storageFactory(logger).deserialize(content);
          const yaml = await handler.getData();
          content = yaml;
        }
        return {
          id: resource._id,
          histId: resource.histId ? resource.histId : resource._id,
          content,
          updated: resource.updated,
        };
      }

      const obj = await models.ResourceYamlHist.findOne({ org_id, cluster_id, resourceSelfLink, _id: histId }, {}, { lean:true });
      if(!obj){
        return null;
      }

      var content = await getContent(obj);
      if ( content ) {
        const handler = storageFactory(logger).deserialize(content);
        const yaml = await handler.getData();
        content = yaml;
      }

      return {
        id: resource._id,
        histId: obj._id,
        content,
        updated: obj.updated,
      };
    },
  },
  Subscription: {
    resourceUpdated: {
      resolve: (parent, { orgID: org_id, filter }, { models, req_id, logger }) => {
        logger.debug(
          { modelKeys: Object.keys(models), org_id, filter, req_id },
          'Subscription.resourceUpdated.resolve',
        );
        const { resourceUpdated } = parent;
        return resourceUpdated;
      },

      subscribe: withFilter(
        // eslint-disable-next-line no-unused-vars
        (parent, args, context) => {
          const topic = getStreamingTopic(EVENTS.RESOURCE.UPDATED, args.orgId);
          context.logger.debug({args, topic}, 'withFilter asyncIteratorFn');
          // TODO: in future probably we should valid authorization here
          return GraphqlPubSub.getInstance().pubSub.asyncIterator(topic);
        },
        async (parent, args, context) => {
          const queryName = 'subscribe: withFilter';
          const { me, req_id, logger } = context;
          logger.debug( {req_id, user: whoIs(me), args },
            `${queryName}: context.keys: [${Object.keys(context)}]`,
          );
          await validAuth(me, args.orgId, ACTIONS.READ, TYPES.RESOURCE, queryName, context);
          let found = true;
          const { resource } = parent.resourceUpdated;
          if (args.orgId !== resource.orgId) {
            return false;
          }
          if (args.filter && args.filter !== '') {
            const tokens = _.filter(args.filter.split(/\s+/));
            // eslint-disable-next-line no-restricted-syntax
            for (const token of tokens) {
              if (
                resource.clusterId.match(token) ||
                resource.selfLink.match(token) ||
                (resource.searchableData.kind &&
                  resource.searchableData.kind.match(token)) ||
                (resource.searchableData.name &&
                  resource.searchableData.name.match(token)) ||
                (resource.searchableData.namespace &&
                  resource.searchableData.namespace.match(token))
              ) {
                // eslint-disable-next-line no-continue
                continue;
              }
              found = false;
              break;
            }
          }
          logger.debug({ req_id, args, found }, 'subscribe: withFilter result');
          return Boolean(found);
        },
      ),
    },
  },
  Mutation: {
    updateClusterResources: async(parent, { clusterId, orgId: org_id, resourceChanges }, context)=>{
      const { models, me, req_id, logger } = context;

      const org = await models.Organization.findOne({ _id: org_id });

      mongoSanitize.sanitize(resourceChanges, { replaceWith: '_' });

      const queryName = 'resourceContent';
      const changeTypes = _.uniq(_.map(resourceChanges, 'type'));
      logger.debug( {req_id, user: whoIs(me), org_id, clusterId, changeTypes, changeCount: resourceChanges.length }, `${queryName} enter`);

      await validAuth(me, org._id, ACTIONS.MANAGE, TYPES.RESOURCE, queryName, context);

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
                    models.Resource.updateMany(
                      childSearchKey,
                      {$set: {'searchableData.subscription_id': subscription_id},$currentDate: { updated: true }},
                      {}
                    );
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
    clusterResourcesSync: async(parent, { clusterId, orgId: org_id }, context)=>{
      const { models, me, req_id, logger } = context;

      const org = await models.Organization.findOne({ _id: org_id });

      const queryName = 'resourceContent';
      logger.debug( {req_id, user: whoIs(me), org_id, clusterId }, `${queryName} enter`);

      await validAuth(me, org._id, ACTIONS.MANAGE, TYPES.RESOURCE, queryName, context);

      try {
        const result = await models.Resource.updateMany(
          { org_id: org._id, cluster_id: clusterId, updated: { $lt: new moment().subtract(1, 'hour').toDate() }, deleted: { $ne: true} },
          { $set: { deleted: true }, $currentDate: { updated: true } },
        );
        logger.debug({ org_id: org._id, cluster_id: clusterId }, `${result.modifiedCount} resources marked as deleted:true`);

        // deletes items >1day old
        const objsToDelete = await models.Resource.find(
          { org_id: org._id, cluster_id: clusterId, deleted: true, updated: { $lt: new moment().subtract(1, 'day').toDate() } }
        );

        if(objsToDelete.length > 0){
          // if we have items that were marked as deleted and havent updated in >=1day, then deletes them
          const selfLinksToDelete = _.map(objsToDelete, 'selfLink');
          logger.info({ org_id: org._id, cluster_id: clusterId, resourceObjs: objsToDelete }, `deleting ${selfLinksToDelete.length} resource objs`);
          await deleteOrgClusterResourceSelfLinks({ models, orgId: org._id, clusterId, selfLinksToDelete });

          models.ResourceStat.updateOne({ org_id: org._id }, { $inc: { deploymentCount: -1 * objsToDelete.length } });
        }

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
