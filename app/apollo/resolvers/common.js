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
const { ForbiddenError, ApolloError } = require('apollo-server');
const { TYPES, ACTIONS } = require('../models/const');

const whoIs = me => { 
  if (me === null || me === undefined) return 'null';
  if (me.email) return me.email;
  if (me.identifier) return me.identifier;
  if (me.type) return me.type;
  return me._id;
};

const validClusterAuth = async (me, queryName, context) => {
  const { models } = context;
  // Users that pass in razee-org-key.  ex: ClusterSubscription or curl requests
  if(me && me.type == 'cluster'){
    const result = await models.User.isValidOrgKey(models, me);
    if(!result){
      throw new ForbiddenError(
        `Invalid razee-org-key was submitted for ${queryName}`,
      );
    }
    return;
  }
}; 

// return user permitted cluster groups in an array 
const getAllowedGroups = async (me, org_id, action, field, queryName, context) => {
  const {req_id, models, logger} = context;

  logger.debug({req_id, user: whoIs(me), org_id, field, action }, `getAllowedGroups enter for ${queryName}`);
  const groups = await models.Group.find({org_id: org_id}).lean();
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
const validAuth = async (me, org_id, action, type, queryName, context) => {
  const {req_id, models, logger} = context;

  // razeedash users (x-api-key)
  if(me && me.type == 'userToken'){
    const result = await models.User.userTokenIsAuthorized(me, org_id, action, type, context);
    if(!result){
      throw new ForbiddenError(
        `You are not allowed to ${action} on ${type} under organization ${org_id} for the query ${queryName}. (using userToken)`,
      );
    }
    return;
  }
  if (me === null || !(await models.User.isAuthorized(me, org_id, action, type, null, context))) {
    logger.error({req_id, me: whoIs(me), org_id, action, type}, `ForbiddenError - ${queryName}`);
    throw new ForbiddenError(
      `You are not allowed to ${action} on ${type} under organization ${org_id} for the query ${queryName}.`,
    );
  }
}; 

// Not Found Error when look up db
class NotFoundError extends ApolloError {
  constructor(message) {
    super(message, 'NOT_FOUND');
    Object.defineProperty(this, 'name', { value: 'NotFoundError' });
  }
}

module.exports =  { whoIs, validAuth, NotFoundError, validClusterAuth, getAllowedGroups, getGroupConditions, getGroupConditionsIncludingEmpty };
