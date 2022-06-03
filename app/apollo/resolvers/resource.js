/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
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

//PLC const { withFilter } = require('apollo-server');
const { withFilter } = require('graphql-subscriptions');

const GraphqlFields = require('graphql-fields');

const { buildSearchForResources, convertStrToTextPropsObj } = require('../utils');
const { ACTIONS, TYPES } = require('../models/const');
const { EVENTS, GraphqlPubSub, getStreamingTopic } = require('../subscription');
const { whoIs, validAuth, getAllowedGroups, getGroupConditionsIncludingEmpty, NotFoundError, BasicRazeeError, RazeeForbiddenError, RazeeQueryError } = require ('./common');
const ObjectId = require('mongoose').Types.ObjectId;
const { applyQueryFieldsToResources } = require('../utils/applyQueryFields');

const storageFactory = require('./../../storage/storageFactory');

// Find resources while enforcing namespace access
const commonResourcesSearch = async ({ me, queryName, orgId, context, searchFilter, limit=500, skip=0, queryFields, sort={created: -1} }) => { // eslint-disable-line
  const {  models, req_id, logger } = context;
  try {
    /*
    Filtering resources by Namespace access must be done as part of the database query.
    If it is done as a separate filter *after* retrieving data from the database, it becomes
    impossible to use pagination (limit+skip).  A client receiving a partial response
    would be unable to tell whether there are more results, or how many to skip.
    */
    // To exclude resources based on Namespaces access, first build a list of all allowed Namespaces
    const nsField = 'searchableData.namespace';
    const allResourceNamespaces = await models.Resource.distinct( nsField, searchFilter );
    // Then determine to which the user has access
    const nsAllowedResults = await Promise.all(
      allResourceNamespaces.map( async n => {
        const forbidden = await validAuth(me, orgId, ACTIONS.READ, TYPES.RESOURCE, queryName, context, [n]);
        return !forbidden;
      } )
    );
    const allAllowedResourceNamespaces = allResourceNamespaces.filter((_v, index) => nsAllowedResults[index]);
    // Then update the searchFilter to require one of the allowed namespaces (or no namespace)
    allAllowedResourceNamespaces.push( null ); // If no namespace is specified, it's allowed
    searchFilter[nsField] = { $in: allAllowedResourceNamespaces };

    // Always exclude deleted records
    searchFilter.deleted = { $ne: true };

    // Finally, search including user provided filter with Namespace access filtering added
    const resources = await models.Resource
      .find(searchFilter)
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .lean({ virtuals: true, defaults: true })
    ;

    // `count` is the number of records in this payload (taking into account `limit`)
    const count = resources.length;
    // `totalCount` is the total number of records matching the search
    const totalCount = await models.Resource.find(searchFilter).count();

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

    // Always exclude deleted records
    searchFilter.deleted = { $ne: true };

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

const resourceResolvers = {
  Query: {
    resourcesCount: async (parent, { orgId: org_id }, context) => {
      const queryName = 'resourcesCount';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      try {
        return await models.Resource.count({
          org_id: org_id,
          deleted: { $ne: true }, /* Always exclude deleted records */
        });
      } catch (error) {
        logger.error(error, 'resourcesCount encountered an error');
        throw new RazeeQueryError(context.req.t('resourcesCount encountered an error. {{error.message}}', {'error.message':error.message}), context);
      }
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

      let searchFilter = { org_id: orgId };
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
      const resourcesResult = await commonResourcesSearch({ me, queryName, orgId, models, searchFilter, limit, skip, queryFields: queryFields.resources, sort, context });
      await applyQueryFieldsToResources(resourcesResult.resources, queryFields.resources, { orgId, subscriptionsLimit }, context);
      return resourcesResult;
    },

    resourcesByCluster: async (
      parent,
      { orgId, clusterId: cluster_id, filter, limit, skip },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resourcesByCluster';
      const { me, models, req_id, logger } = context;
      logger.debug( {req_id, user: whoIs(me), orgId, filter, limit, queryFields }, `${queryName} enter`);

      limit = _.clamp(limit, 1, 10000);
      skip = _.clamp(skip, 0, Number.MAX_SAFE_INTEGER);

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
      };
      if (filter && filter !== '') {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      logger.debug({req_id}, `searchFilter=${JSON.stringify(searchFilter)}`);
      const resourcesResult = await commonResourcesSearch({ me, queryName, orgId, context, searchFilter, limit, skip, queryFields });
      await applyQueryFieldsToResources(resourcesResult.resources, queryFields.resources, { orgId }, context);
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

    resourcesBySubscription: async ( parent, { orgId, subscriptionId: subscription_id, limit, skip }, context, fullQuery) => {
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
      const searchFilter = { org_id: orgId, 'searchableData.subscription_id': subscription_id };
      const resourcesResult = await commonResourcesSearch({ me, queryName, orgId, context, searchFilter, limit, skip, queryFields });
      await applyQueryFieldsToResources(resourcesResult.resources, queryFields.resources, { orgId }, context);
      return resourcesResult;
    },

    resourceHistory: async(parent, { orgId: org_id, clusterId: cluster_id, resourceSelfLink, beforeDate, afterDate, limit, skip }, context)=>{
      const { models, me, req_id, logger } = context;

      limit = _.clamp(limit, 1, 1000);
      skip = _.clamp(skip, 0, Number.MAX_SAFE_INTEGER);

      const queryName = 'resourceHistory';
      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, resourceSelfLink, beforeDate, afterDate, limit, skip }, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);
      const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', 'resource.commonResourceSearch', context);
      let cluster = await models.Cluster.findOne({ org_id: org_id, cluster_id, ...conditions}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeForbiddenError(context.req.t('You are not allowed to access this resource due to missing cluster group permission.'), context);
      }

      const searchFilter = {
        org_id, cluster_id, resourceSelfLink
      };

      // Always exclude deleted records
      searchFilter.deleted = { $ne: true };

      const updatedSearchObj = {};
      if(beforeDate){
        updatedSearchObj.$lte = beforeDate;
      }
      if(afterDate){
        updatedSearchObj.$gte = afterDate;
      }
      if(!_.isEmpty(updatedSearchObj)){
        searchFilter.updated = updatedSearchObj;
      }

      const histObjs = await models.ResourceYamlHist
        .find(searchFilter)
        .sort({ _id:1, updated:1 })
        .limit(limit)
        .skip(skip)
        .lean({ virtuals: true })
      ;

      // `count` is the number of records in this payload (taking into account `limit`)
      const count = histObjs.length;
      // `totalCount` is the total number of records matching the search
      const totalCount = await models.ResourceYamlHist.find( searchFilter ).count();

      return {
        count,
        totalCount,
        items: histObjs,
      };
    },

    resourceContent: async(parent, { orgId: org_id, clusterId: cluster_id, resourceSelfLink, histId=null }, context)=>{
      const { models, me, req_id, logger } = context;

      const logContext = {req_id, user: whoIs(me), org_id, cluster_id, resourceSelfLink, histId };

      const queryName = 'resourceContent';
      logger.debug( logContext, `${queryName} enter`);
      // await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      const conditions = await getGroupConditionsIncludingEmpty(me, org_id, ACTIONS.READ, 'uuid', 'resource.commonResourceSearch', context);
      let cluster = await models.Cluster.findOne({ org_id: org_id, cluster_id, ...conditions}).lean({ virtuals: true });
      if (!cluster) {
        throw new RazeeForbiddenError(context.req.t('You are not allowed to access this resource due to missing cluster group permission.'), context);
      }

      const resource = await models.Resource.findOne({ org_id, cluster_id, selfLink: resourceSelfLink },  {},  { lean:true });
      if(!resource){
        logger.info( logContext, 'Resource for org_id, cluster_id, selfLink not found in database' );
        throw new NotFoundError(context.req.t('Query {{queryName}} find error. MessageID: {{req_id}}.', {queryName, req_id}), context);
      }

      if( !histId || histId == resource.histId || histId == resource._id.toString() ){
        logger.info( logContext, `Getting content for current resource (_id: '${resource._id.toString()}', histId: '${resource.histId}')` );
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
      logger.info( logContext, `Getting content for resource history (current resource _id: '${resource._id.toString()}', histId: '${resource.histId})` );

      const histObj = await models.ResourceYamlHist.findOne({ org_id, cluster_id, resourceSelfLink, _id: histId }, {}, { lean:true });
      if(!histObj){
        logger.info( logContext, 'Resource History for org_id, cluster_id, selfLink, histId not found in database' );
        throw new NotFoundError(context.req.t('Query {{queryName}} find error. MessageID: {{req_id}}.', {queryName, req_id}), context);
      }

      let content = histObj.yamlStr;
      if(content) {
        const handler = storageFactory(logger).deserialize(content);
        content = await handler.getData();
      }

      return {
        id: resource._id,
        histId: histObj._id,
        content,
        updated: histObj.updated,
      };
    },
  },
  Subscription: {
    resourceUpdated: {
      resolve: (parent, { orgId: org_id, filter, parent: parentPLC }, { models, req_id, logger }) => {
        console.log( `PLC Subscription.resourceUpdated.resolve entry, parent: ${parent}, org_id: ${org_id}, filter: ${filter}, req_id: ${req_id}, parentPLC: ${parentPLC}` );
        logger.debug(
          { modelKeys: Object.keys(models), org_id, filter, req_id },
          'Subscription.resourceUpdated.resolve',
        );

        //PLC
        //if( !parent ) throw new Error( `PLC no parent error` );

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
};

module.exports = resourceResolvers;
