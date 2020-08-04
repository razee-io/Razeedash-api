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
const { withFilter, ForbiddenError } = require('apollo-server');
const GraphqlFields = require('graphql-fields');

const { buildSearchForResources, convertStrToTextPropsObj } = require('../utils');
const { ACTIONS, TYPES } = require('../models/const');
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');
const { whoIs, validAuth, getAllowedGroups, getGroupConditionsIncludingEmpty, applyClusterInfoOnResources, NotFoundError } = require ('./common');
const ObjectId = require('mongoose').Types.ObjectId;

const conf = require('../../conf.js').conf;
const S3ClientClass = require('../../s3/s3Client');
const url = require('url');

// This is service level search function which does not verify user tag permission
const commonResourcesSearch = async ({ context, org_id, searchFilter, limit=500, queryFields, sort={created: -1} }) => {
  const {  models, req_id, logger } = context;
  try {
    const resources = await models.Resource.find(searchFilter)
      .sort(sort)
      .limit(limit)
      .lean({ virtuals: true })
    ;
    var count = await models.Resource.find(searchFilter).count();
    // if user is requesting the cluster field (i.e cluster_id/name), then adds it to the results
    if( (queryFields.resources||{}).cluster ) {
      applyClusterInfoOnResources(org_id, resources, context);
    }
    return {
      count,
      resources,
    };
  } catch (error) {
    logger.error(error, `commonResourcesSearch encountered an error for the request ${req_id}`);
    throw error;
  }  
};

const isLink = (s) => {
  return /^(http|https):\/\/?/.test(s);
};

const s3IsDefined = () => {
  return conf.s3.endpoint;
};

const getS3Data = async (s3Link, logger) => {
  try {
    const s3Client = new S3ClientClass(conf);
    const link = url.parse(s3Link); 
    const paths = link.path.split('/');
    const bucket = paths[1];
    // we do not need to decode URL here because path[2] and path[3] are hash code
    // path[2] stores keyHash , path[3] stores searchableDataHash 
    const resourceName = paths.length > 3 ? paths[2] + '/' + paths[3] : paths[2];
    const s3stream = s3Client.getObject(bucket, resourceName).createReadStream();
    const yaml = await readS3File(s3stream);
    return yaml;
  } catch (error) {
    logger.error(error, 'Error retrieving data from s3 bucket');
    throw(error);
  }
};

const readS3File = async (readable) => {
  readable.setEncoding('utf8');
  let data = '';
  for await (const chunk of readable) {
    data += chunk;
  }
  return data;
};

const commonResourceSearch = async ({ context, org_id, searchFilter, queryFields }) => {
  const { models, me, req_id, logger } = context;
  try {
    const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', 'resource.commonResourceSearch', context);

    searchFilter['deleted'] = false;
    let resource = await models.Resource.findOne(searchFilter).lean({ virtuals: true });

    if (!resource) return resource;

    if (queryFields['data'] && resource.data && isLink(resource.data) && s3IsDefined()) {
      const yaml = getS3Data(resource.data, logger);
      resource.data = yaml;
    }

    let cluster = await models.Cluster.findOne({ org_id: org_id, cluster_id: resource.cluster_id, ...conditions}).lean({ virtuals: true });
    if (!cluster) {
      throw new ForbiddenError('you are not allowed to access this resource due to missing cluster tag permission.');
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
    throw error;
  }
};

// usage: buildSortObj([{field: 'updated', desc: true}], ['_id', 'name', 'created', 'updated']);
const buildSortObj = (sortArr, allowedFields)=>{
  if(!allowedFields){
    throw new Error('you need to pass allowedFields into buildSortObj()');
  }
  var out = {};
  _.each(sortArr, (sortObj)=>{
    if(!_.includes(allowedFields, sortObj.field)){
      throw new Error(`You are not allowed to sort on field "${sortObj.field}"`);
    }
    out[sortObj.field] = (sortObj.desc ? -1 : 1);
  });
  return out;
};

const applyQueryFieldsToResources = async(resources, queryFields, { subscriptionsLimit = 500 }, models)=>{
  if(_.get(queryFields, 'resources.subscription')){
    var subscriptionUuids = _.filter(_.uniq(_.map(resources, 'searchableData.subscription_id')));
    var subscriptions = await models.Subscription.find({ uuid: { $in: subscriptionUuids } }).limit(subscriptionsLimit).lean({ virtuals: true });
    _.each(subscriptions, (sub)=>{
      if(_.isUndefined(sub.channelName)){
        sub.channelName = sub.channel;
      }
    });
    var subscriptionsByUuid = _.keyBy(subscriptions, 'uuid');
    _.each(resources, (resource)=>{
      var subId = resource.searchableData.subscription_id;
      if(!subId){
        return;
      }
      resource.subscription = subscriptionsByUuid[subId] || null;
      if(resource.subscription) {
        delete resource.subscription.channel;
      }
    });

    if(_.get(queryFields, 'resources.subscription.channel')){

      var channelUuids = _.filter(_.uniq(_.map(resources, 'subscription.channel_uuid')));
      var channels = await models.Channel.find({ uuid: { $in: channelUuids } }).lean({ virtuals: true });
      var channelsByUuid = _.keyBy(channels, 'uuid');
      _.each(resources, (resource)=>{
        if(!resource.subscription){
          return;
        }
        resource.subscription.channel = null;
        resource.subscription.channel = channelsByUuid[resource.subscription.channel_uuid] || null;
      });
    }
  }
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
        throw error;
      }
      return count;
    },
    resources: async (
      parent,
      { orgId: org_id, filter, fromDate, toDate, limit, kinds = [], sort, subscriptionsLimit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resources';
      const { me, req_id, logger, models } = context;
      logger.debug( {req_id, user: whoIs(me), org_id, filter, fromDate, toDate, limit, queryFields }, `${queryName} enter`);

      limit = _.clamp(limit, 1, 10000);

      // use service level read
      await validAuth(me, org_id, ACTIONS.SERVICELEVELREAD, TYPES.RESOURCE, queryName, context);

      sort = buildSortObj(sort, ['_id', 'cluster_id', 'selfLink', 'created', 'updated', 'lastModified', 'deleted', 'hash']);

      let searchFilter = { org_id: org_id, deleted: false, };
      if(kinds.length > 0){
        searchFilter['searchableData.kind'] = { $in: kinds };
      }
      if ((filter && filter !== '') || fromDate != null || toDate != null) {
        var props = convertStrToTextPropsObj(filter);
        var textProp = props.$text || '';
        _.assign(searchFilter, models.Resource.translateAliases(_.omit(props, '$text')));
        searchFilter = buildSearchForResources(searchFilter, textProp, fromDate, toDate, kinds);
      }
      const resourcesResult = await commonResourcesSearch({ models, org_id, searchFilter, limit, queryFields, sort, context });

      await applyQueryFieldsToResources(resourcesResult.resources, queryFields, { subscriptionsLimit }, models);

      return resourcesResult;
    },

    resourcesByCluster: async (
      parent,
      { orgId: org_id, clusterId: cluster_id, filter, limit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resourcesByCluster';
      const { me, models, req_id, logger } = context;
      logger.debug( {req_id, user: whoIs(me), org_id, filter, limit, queryFields }, `${queryName} enter`);

      limit = _.clamp(limit, 1, 10000);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      const cluster = await models.Cluster.findOne({cluster_id}).lean({ virtuals: true });
      if (!cluster) {
        // if some tag of the sub does not in user's tag list, throws an error
        throw new NotFoundError(`Could not find the cluster for the cluster id ${cluster_id}.`);
      }
      const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.READ, 'uuid', queryName, context);
      if (cluster.groups) {
        cluster.groups.some(group => {
          if(allowedGroups.indexOf(group.uuid) === -1) {
            // if some group of the sub does not in user's group list, throws an error
            throw new ForbiddenError(`you are not allowed to read resources due to missing permissions on cluster group ${group.name}.`);
          }
          return false;
        });
      }

      let searchFilter = {
        org_id: org_id,
        cluster_id: cluster_id,
        deleted: false,
      };
      if (filter && filter !== '') {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      logger.debug({req_id}, `searchFilter=${JSON.stringify(searchFilter)}`);
      const resourcesResult = await commonResourcesSearch({ context, org_id, searchFilter, limit, queryFields });
      await applyQueryFieldsToResources(resourcesResult.resources, queryFields, { }, models);
      return resourcesResult;
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
      resource.histId = resource._id;
      if(histId && histId != _id){
        var resourceYamlHistObj = await models.ResourceYamlHist.findOne({ _id: histId, org_id, resourceSelfLink: resource.selfLink }, {}, {lean:true});
        if(!resourceYamlHistObj){
          throw new NotFoundError(`hist _id "${histId}" not found`);
        }
        resource.histId = resourceYamlHistObj._id;
        resource.data = resourceYamlHistObj.yamlStr;
        if (queryFields['data'] && resource.data && isLink(resource.data) && s3IsDefined()) {
          const yaml = getS3Data(resource.data, logger);
          resource.data = yaml;
        }

        resource.updated = resourceYamlHistObj.updated;
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
      resource.histId = resource._id;
      return resource;
    },

    resourcesBySubscription: async ( parent, { orgId: org_id, subscriptionId: subscription_id}, context, fullQuery) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resourcesBySubscription';
      const {  me, models, req_id, logger } = context;
  
      logger.debug( {req_id, user: whoIs(me), org_id, subscription_id, queryFields}, `${queryName} enter`);
  
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);
      const subscription = await models.Subscription.findOne({uuid: subscription_id}).lean({ virtuals: true });
      if (!subscription) {
        // if some tag of the sub does not in user's tag list, throws an error
        throw new NotFoundError(`Could not find the subscription for the subscription id ${subscription_id}.`);
      }
      const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.READ, 'name', queryName, context);
      if(subscription.groups) {
        subscription.groups.some(group => {
          if(allowedGroups.indexOf(group) === -1) {
            // if some tag of the sub does not in user's tag list, throws an error
            throw new ForbiddenError(`you are not allowed to read resources due to missing permissions on subscription group ${group}.`);
          }
          return false;
        });
      }
      const searchFilter = { org_id, 'searchableData.subscription_id': subscription_id, deleted: false, };
      const resourcesResult = await commonResourcesSearch({ context, org_id, searchFilter, queryFields });
      await applyQueryFieldsToResources(resourcesResult.resources, queryFields, { }, models);
      return resourcesResult;
    },

    resourceHistory: async(parent, { orgId: org_id, clusterId: cluster_id, resourceSelfLink, beforeDate, afterDate, limit }, context)=>{
      const { models, me, req_id, logger } = context;

      limit = _.clamp(limit, 1, 1000);

      const queryName = 'resourceHistory';
      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, resourceSelfLink, beforeDate, afterDate, limit }, `${queryName} enter`);
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      var searchObj = {
        org_id, cluster_id, resourceSelfLink
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
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      var getContent = async(obj)=>{
        return obj.yamlStr;
      };

      const resource = await models.Resource.findOne({ org_id, cluster_id, selfLink: resourceSelfLink });
      if(!histId || histId == resource._id.toString()){
        let content = await getContent(resource);
        return {
          id: resource._id,
          histId: resource._id,
          content,
          updated: resource.updated,
        };
      }

      const obj = await models.ResourceYamlHist.findOne({ org_id, cluster_id, resourceSelfLink, _id: histId }, {}, { lean:true });
      if(!obj){
        return null;
      }

      var content = await getContent(obj);
      if ( content && isLink(content) && s3IsDefined()) {
        const yaml = getS3Data(content, logger);
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
      resolve: (parent, { orgID: org_id, filter }, { models, me, req_id, logger }) => {
        logger.debug(
          { modelKeys: Object.keys(models), org_id, filter, me, req_id },
          'Subscription.resourceUpdated.resolve',
        );
        const { resourceUpdated } = parent;
        return resourceUpdated;
      },

      subscribe: withFilter(
        // eslint-disable-next-line no-unused-vars
        (parent, args, context) => {
          const topic = getStreamingTopic(EVENTS.RESOURCE.UPDATED, args.orgId);
          context.logger.debug({args, me: context.me, topic}, 'withFilter asyncIteratorFn');
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
};

module.exports = resourceResolvers;
