/**
 * Copyright 2020, 2023 IBM Corp. All Rights Reserved.
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
const { ApolloError } = require('apollo-server');
const { TYPES, ACTIONS } = require('../models/const');

const whoIs = me => {
  if (me === null || me === undefined) return 'null';
  if (me.identifier) return me.identifier;
  if (me.email) return me.email;
  if (me.type) return me.type;
  return me._id;
};

const MAX_QUERY_DEPTH = 6;
const MAX_QUERY_DUPLICATION = 0;

const checkComplexity = ( obj, parentNames=[] ) => {
  const depth = parentNames.length;
  const duplication = parentNames.length - (new Set(parentNames)).size;

  if( depth > MAX_QUERY_DEPTH ) throw new Error( `Query depth exceeds maximum (${MAX_QUERY_DEPTH}): ${parentNames.join('.')}` );
  if( duplication > MAX_QUERY_DUPLICATION ) throw new Error( `Query recursion exceeds maximum (${MAX_QUERY_DUPLICATION}): ${parentNames.join('.')}` );

  const ownPropertyNames = Object.getOwnPropertyNames( obj );
  for( const propertyName of ownPropertyNames ) {
    checkComplexity( obj[propertyName], [ ...parentNames, propertyName ] );
  }
};

const validClusterAuth = async (me, queryName, context) => {
  const { models } = context;
  // Users that pass in razee-org-key.  ex: ClusterSubscription or curl requests
  if(me && me.type == 'cluster'){
    const result = await models.User.isValidOrgKey(models, me, context.logger);
    if(!result){
      throw new RazeeForbiddenError(context.req.t(
        'Invalid razee-org-key was submitted for {{queryName}}', {'queryName':queryName}), context
      );
    }
    return;
  }
};

var filterClustersToAllowed = async(me, org_id, action, field, clusters, context)=>{
  const { models } = context;
  var decisionInputs = _.map(clusters, (cluster)=>{
    return {
      type: field,
      action,
      uuid: cluster.cluster_id,
      name: cluster.registration.name,
    };
  });
  var decisions = await models.User.isAuthorizedBatch(me, org_id, decisionInputs, context);
  clusters = _.filter(clusters, (val, idx)=>{
    return decisions[idx];
  });
  return clusters;
};

var getAllowedChannels = async(me, org_id, action, field, context)=>{
  const { models } = context;
  var channels = await models.Channel.find({ org_id });
  return await filterChannelsToAllowed(me, org_id, action, field, channels, context);
};

var filterChannelsToAllowed = async(me, org_id, action, field, channels, context)=>{
  const { models } = context;
  var decisionInputs = _.map(channels, (channel)=>{
    return {
      type: field,
      action,
      uuid: channel.uuid,
      name: channel.name,
    };
  });
  var decisions = await models.User.isAuthorizedBatch(me, org_id, decisionInputs, context);
  channels = _.filter(channels, (val, idx)=>{
    return decisions[idx];
  });
  return channels;
};

var getAllowedSubscriptions = async(me, org_id, action, field, context)=>{
  const { models } = context;
  var subscriptions = await models.Subscription.find({ org_id });
  return await filterSubscriptionsToAllowed(me, org_id, action, field, subscriptions, context);
};

var filterSubscriptionsToAllowed = async(me, org_id, action, field, subscriptions, context)=>{
  const { models } = context;
  var decisionInputs = _.map(subscriptions, (subscription)=>{
    return {
      type: field,
      action,
      uuid: subscription.uuid,
      name: subscription.name,
    };
  });
  var decisions = await models.User.isAuthorizedBatch(me, org_id, decisionInputs, context);
  subscriptions = _.filter(subscriptions, (val, idx)=>{
    return decisions[idx];
  });
  return subscriptions;
};

// get and return user permitted cluster groups in an array
const getAllowedGroups = async (me, org_id, action, field, queryName, context) => {
  const {req_id, models, logger} = context;

  logger.debug({req_id, user: whoIs(me), org_id, field, action }, `getAllowedGroups enter for ${queryName}`);
  const groups = await models.Group.find({org_id}).lean();
  const objectArray = groups.map(group => {
    return {type: TYPES.GROUP, action, uuid: group.uuid, name: group.name};
  });
  const decisions = await models.User.isAuthorizedBatch(me, org_id, objectArray, context);

  const allowedGroups = [];
  decisions.forEach( (d, i) => {
    if (d) {
      allowedGroups.push(objectArray[i][field]);
    }
  });
  logger.debug({req_id, user: whoIs(me), org_id, action, allowedGroups}, `getAllowedGroups exit for ${queryName}`);
  return allowedGroups;
};

// return user permitted cluster groups in an array
const filterGroupsToAllowed = async (me, org_id, action, field, groups, context) => {
  const {models} = context;
  var objectArray = groups.map(group => {
    return {
      type: TYPES.GROUP,
      action,
      uuid: group.uuid,
      name: group.name
    };
  });
  var decisions = await models.User.isAuthorizedBatch(me, org_id, objectArray, context);
  groups = _.filter(groups, (val, idx)=>{
    return decisions[idx];
  });
  return groups;
};

// the condition will be true if all groups are subset of user permitted groups
const getGroupConditions = async (me, org_id, action, field, queryName, context) => {
  const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.READ, field, queryName, context);
  if (field === 'uuid') {
    return {
      groups: {$not: {$elemMatch: {uuid: {$nin: allowedGroups}}}},
    };
  }
  return {
    'groups': {$not: {$elemMatch: {$nin: allowedGroups}}},
  };
};

// the condition will be true if all gropus are subset of user permitted groups or not groups at all
const getGroupConditionsIncludingEmpty = async (me, org_id, action, field, queryName, context) => {
  const allowedGroups = await getAllowedGroups(me, org_id, ACTIONS.READ, field, queryName, context);
  if (field === 'uuid') {
    return {
      $or: [
        {'groups.uuid': { $exists: false }},
        {groups: {$not: {$elemMatch: {uuid: {$nin: allowedGroups}}}}}
      ]
    };
  }
  return {
    $or: [
      {'groups': {$not: {$elemMatch: {$nin: allowedGroups}}}},
      {'groups': { $exists: false }}
    ]
  };
};

// Validate is user is authorized for the requested action.
// Throw exception if not.
const validAuth = async (me, org_id, action, type, queryName, context, attrs = null) => {
  const {req_id, models, logger} = context;

  if (context.recoveryHintsMap) {
    context['recoveryHints'] = context.recoveryHintsMap[queryName];
  }

  // razeedash users (x-api-key)
  if(me && me.type == 'userToken'){
    const result = await models.User.userTokenIsAuthorized(me, org_id, action, type, context);
    if(!result){
      throw new RazeeForbiddenError(
        context.req.t('You are not allowed to {{action}} on {{type}} under organization {{org_id}} for the query {{queryName}}.', {'action':action, 'type':type, 'org_id':org_id, 'queryName':queryName, interpolation: { escapeValue: false }}
        ), context);

    }
    return;
  }
  if (me === null || !(await models.User.isAuthorized(me, org_id, action, type, attrs, context))) {
    logger.error({req_id, me: whoIs(me), org_id, action, type}, `ForbiddenError - ${queryName}`);
    if (type === TYPES.RESOURCE){
      return true;
    } else {
      throw new RazeeForbiddenError(context.req.t('You are not allowed to {{action}} on {{type}} under organization {{org_id}} for the query {{queryName}}.', {'action':action, 'type':type, 'org_id':org_id, 'queryName':queryName, interpolation: { escapeValue: false }}), context);

    }
  }
};

// a helper function to render clusterInfo for a list of resources
const applyClusterInfoOnResources = async (org_id, resources, models) => {
  const clusterIds = _.uniq(_.map(resources, 'cluster_id'));
  if(clusterIds.length > 0){
    let clusters = await models.Cluster.find({ org_id, cluster_id: { $in: clusterIds }}).lean({ virtuals: true });
    clusters = _.map(clusters, (cluster)=>{
      cluster.name = cluster.name || (cluster.metadata || {}).name || (cluster.registration || {}).name || cluster.cluster_id;
      return cluster;
    });
    clusters = _.keyBy(clusters, 'cluster_id');
    resources.forEach((resource)=>{
      resource.cluster = clusters[resource.cluster_id] || null;
    });
  }
};

const commonClusterSearch = async (
  models,
  searchFilter,
  { limit, skip=0, startingAfter }
) => {
  // If startingAfter specified, we are doing pagination so add another filter
  if (startingAfter) {
    Object.assign(searchFilter, { _id: { $lt: startingAfter } });
  }

  const results = await models.Cluster.find(searchFilter)
    .sort({ _id: -1 })
    .limit(limit)
    .skip(skip)
    .lean({ virtuals: true });
  return results;
};

// base error class which include req_id and recovery hint in the error
class BasicRazeeError extends ApolloError {
  constructor(message, context, name) {
    const {req_id, recoveryHints} = context;
    const extensions = {incidentID: req_id};
    if (recoveryHints && recoveryHints[name]) {
      extensions['recoveryHint'] = recoveryHints[name];
    }
    super(message, name, extensions);
    Object.defineProperty(this, 'name', { value: name });
  }
}

// Not Found Error when look up db
class NotFoundError extends BasicRazeeError {
  constructor(message, context) {
    var name = 'NotFoundError';
    super(message, context, name);
  }
}

// Customized Forbidden Error
class RazeeForbiddenError extends BasicRazeeError {
  constructor(message, context) {
    var name = 'ForbiddenError';
    super(message, context, name);
  }
}

// Customized  Validation Error
class RazeeValidationError extends BasicRazeeError {
  constructor(message, context) {
    var name = 'ValidationError';
    super(message, context, name);
  }
}

class RazeeQueryError extends BasicRazeeError {
  constructor(message, context) {
    var name = 'QueryError';
    super(message, context, name);
  }
}

class RazeeMaintenanceMode extends BasicRazeeError {
  constructor(message, context) {
    const name = 'MaintenanceMode';
    super(message, context, name);
  }
}

module.exports =  {
  whoIs, checkComplexity, validAuth,
  filterClustersToAllowed, getAllowedChannels, filterChannelsToAllowed, getAllowedSubscriptions, filterSubscriptionsToAllowed,
  BasicRazeeError, NotFoundError, RazeeValidationError, RazeeForbiddenError, RazeeQueryError, RazeeMaintenanceMode,
  validClusterAuth, getAllowedGroups, filterGroupsToAllowed, getGroupConditions, getGroupConditionsIncludingEmpty, applyClusterInfoOnResources, commonClusterSearch,
};
