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

// return user permitted tags in an array 
const getUserTags = async (me, org_id, action, field, queryName, context) => {
  const {req_id, models, logger} = context;

  logger.debug({req_id, user: whoIs(me), org_id, field, action }, `getUserTags enter for ${queryName}`);
  const labels = await models.Label.find({orgId: org_id}).lean();
  const objectArray = labels.map(l => {
    return {type: TYPES.LABEL, action, uuid: l.uuid, name: l.name};
  });
  const decisions = await models.User.isAuthorizedBatch(me, org_id, objectArray, context);

  const allowedTags = [];
  decisions.forEach( (d, i) => {
    if (d) {
      allowedTags.push(objectArray[i][field]);
    }
  });
  logger.debug({req_id, user: whoIs(me), org_id, action, allowedTags}, `getUserTags exit for ${queryName}`);
  return allowedTags;
};

// the condition will be true if all tags are subset of user permitted tags
const getUserTagConditions = async (me, org_id, action, field, queryName, context) => {
  const userTags = await getUserTags(me, org_id, ACTIONS.READ, field, queryName, context);
  if (field === 'uuid') {
    return {
      tags: {$not: {$elemMatch: {uuid: {$nin: [userTags]}}}},
    };
  } 
  return {
    'tags': {$not: {$elemMatch: {$nin: userTags}}},
  };
};

// the condition will be true if all tags are subset of user permitted tags or not tags at all
const getUserTagConditionsIncludingEmpty = async (me, org_id, action, field, queryName, context) => {
  const userTags = await getUserTags(me, org_id, ACTIONS.READ, field, queryName, context);
  if (field === 'uuid') {
    return {
      $or: [
        {'tags.uuid': { $exists: false }},
        {tags: {$not: {$elemMatch: {uuid: {$nin: [userTags]}}}}}
      ]
    };
  } 
  return {
    $or: [
      {'tags': {$not: {$elemMatch: {$nin: userTags}}}},
      {'tags': { $exists: false }}
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

module.exports =  { whoIs, validAuth, NotFoundError, validClusterAuth, getUserTags, getUserTagConditions, getUserTagConditionsIncludingEmpty };
