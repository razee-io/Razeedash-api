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

/*
Get resources specified by `type`, restricted to those the user is authorized to `action` (which could be none, returning an empty array).
If querying Groups, can query groups matching a passed array of group UUIDs.
If querying Subscriptions, can query subscriptions matching a passed query object.
*/
const getAllowedResources = async(me, org_id, action, type, queryName, context, searchTags=null, searchUuids=null, searchQuery=null)=>{
  const { models } = context;
  let allAllowed = false;
  let resources;

  try {
    await validAuth(me, org_id, action, type, queryName, context);
    allAllowed = true;
  }
  catch(e){ // if exception thrown, user does NOT have auth to all resources of this type, and code must later filter based on fine grained auth
  }

  const modelType = type.charAt(0).toUpperCase() + type.slice(1);

  // find by resource type
  if (searchTags) {
    resources = await models[modelType].find({org_id, tags: {$all: searchTags}});
  }
  else if (type === 'group') {
    if (searchUuids) {
      resources = await models[modelType].find({org_id, uuid: {$in: searchUuids}});
    }
    else {
      resources = await models[modelType].find({org_id}).lean({virtuals: true});
    }
  }
  else if (type === 'subscription') {
    if (searchQuery) {
      resources = await models[modelType].find(searchQuery).lean({virtuals: true});
    }
  }
  else {
    resources = await models[modelType].find({org_id});
  }

  if (!allAllowed) {
    return await filterResourcesToAllowed(me, org_id, action, type, resources, context);
  }

  return resources;
};

// return user permitted resources in an array
const filterResourcesToAllowed = async(me, org_id, action, field, resources, context)=>{
  const { models } = context;
  let decisionInputs = _.map(resources, (resource)=>{
    if (field === 'cluster'){
      return {
        type: field,
        action,
        uuid: resource.cluster_id,
        name: resource.registration.name || resource.name,
      };
    }
    else {
      return {
        type: field,
        action,
        uuid: resource.uuid,
        name: resource.name,
      };
    }
  });
  const decisions = await models.User.isAuthorizedBatch(me, org_id, decisionInputs, context);
  resources = _.filter(resources, (val, idx)=>{
    return decisions[idx];
  });
  return resources;
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

// the condition will be true if all groups are subset of user permitted groups or not groups at all
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

// Validate if user is authorized for the requested action, throw exception if not.
const validAuth = async (me, org_id, action, type, queryName, context, attrs=null) => {
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
  whoIs, checkComplexity, validClusterAuth, getAllowedResources, filterResourcesToAllowed, getAllowedGroups,
  getGroupConditions, getGroupConditionsIncludingEmpty, validAuth, applyClusterInfoOnResources, commonClusterSearch,
  BasicRazeeError, NotFoundError, RazeeValidationError, RazeeForbiddenError, RazeeQueryError, RazeeMaintenanceMode,
};
