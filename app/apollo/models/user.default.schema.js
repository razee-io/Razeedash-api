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

const bunyan = require('bunyan');
const mongoose = require('mongoose');
const { ForbiddenError } = require('apollo-server');
const { getBunyanConfig } = require('../../utils/bunyan');

const _ = require('lodash');

const logger = bunyan.createLogger(
  getBunyanConfig('razeedash-api/apollo/models/user.default.schema'),
);

const UserDefaultSchema = new mongoose.Schema({
  _id: {
    type: String,
  },
  type: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  apiKey: {
    type: String,
  },
  profile: {
    currentOrgName: {
      type: String,
    },
  },
}, {
  strict:'throw',
});

UserDefaultSchema.statics.getKubeOwnerName = async(context)=>{ // eslint-disable-line no-unused-vars
  return null;
};

UserDefaultSchema.statics.getKubeOwnerId = async(context)=>{ // eslint-disable-line no-unused-vars
  return null;
};

UserDefaultSchema.statics.getMeFromRequest = async function(req, context) {
  const {req_id, logger} = context;
  const apiKey = req.get('x-api-key');
  const orgKey = req.get('razee-org-key');

  logger.debug({ req_id }, 'default getMeFromRequest');
  let type, id;
  if(apiKey) {
    type = 'userToken';
    const user = await this.findOne({ apiKey: apiKey }).lean();
    if(!user) {
      logger.error('A user was not found for this apiKey');
      throw new ForbiddenError('user not found');
    }
    id = user._id;
  } else {
    type = 'cluster';
  }
  return {
    apiKey, orgKey, type, _id: id,
  };
};

UserDefaultSchema.statics.getMeFromConnectionParams = async function(connectionParams, context){
  const {req_id, logger} = context;
  logger.debug({ req_id, connectionParams }, 'default getMeFromConnectionParams');
  const orgKey = connectionParams.headers['razee-org-key'];
  return {orgKey, type: 'cluster'};
};

UserDefaultSchema.statics.userTokenIsAuthorized = async function(me, orgId, action, type, context) {
  const {req_id, models, logger} = context;
  logger.debug({ req_id: req_id }, `default userTokenIsAuthorized ${action} ${type}`);

  const user = await this.findOne({ apiKey: me.apiKey }).lean();
  if(!user) {
    logger.error('A user was not found for this apiKey');
    throw new ForbiddenError('user not found');
  }

  // make sure that the user is a member of the orgId that was passed in
  const orgs = user.orgs || [];
  const orgNames = orgs.map( (org) => org.name );
  const targetOrg = await this.getOrgById(models, orgId);
  if(!orgNames.includes(targetOrg.name)) {
    logger.error('The user is not a member of the supplied org');
    throw new ForbiddenError('user org not found');
  }

  return user;
};

UserDefaultSchema.statics.isAuthorizedBatch = async function(me, orgId, objectArray, context) {
  const { req_id, models, logger } = context;
  logger.debug({ req_id, orgId, objectArray, me },'default isAuthorizedBatch enter..');

  if (!me || me === null || me.type === 'cluster') {
    // say no for if it is cluster facing api
    logger.debug({ req_id, orgId, reason: 'me is empty or cluster type'},'default isAuthorizedBatch exit..');
    var result = false;
    if(await models.User.isValidOrgKey(models, me)){
      result = true;
    }
    return new Array(objectArray.length).fill(result);
  }

  const user = await this.findOne({ apiKey: me.apiKey }).lean();
  if(!user) {
    logger.error('A user was not found for this apiKey');
    return new Array(objectArray.length).fill(false);
  }

  const orgName = user.profile.currentOrgName;
  if(!orgName) {
    logger.error('An org has not been set for this user');
    return new Array(objectArray.length).fill(false);
  }
  const org = await models.Organization.findOne({ name: orgName }).lean();
  if(!org || org._id !== orgId) {
    logger.error('User is not authorized for this organization');
    return new Array(objectArray.length).fill(false);
  }
  return new Array(objectArray.length).fill(true);
};

UserDefaultSchema.statics.isAuthorized = async function(me, orgId, action, type, attributes, req_id) {
  logger.debug({ req_id: req_id },`default isAuthorized ${action} ${type} ${attributes}`);

  const user = await this.findOne({ apiKey: me.apiKey }).lean();
  if(!user) {
    logger.error('A user was not found for this apiKey');
    throw new ForbiddenError('user not found');
  }
  logger.debug('user found using apiKey', user);
  return user;
};

UserDefaultSchema.statics.isValidOrgKey = async function(models, me) {
  logger.debug('default isValidOrgKey');
  const org = await models.Organization.findOne({ orgKeys: me.orgKey }).lean();
  if(!org) {
    logger.error('An org was not found for this razee-org-key');
    throw new ForbiddenError('org id was not found');
  }
  logger.debug('org found using orgKey');
  return org;
};

UserDefaultSchema.statics.getOrgs = async function(context) {
  const results = [];
  const { models, me } = context;
  const meFromDB = await models.User.findOne({ _id: me._id}).lean();
  if (meFromDB && meFromDB.orgs) {
    // eslint-disable-next-line no-restricted-syntax
    for (const org of meFromDB.orgs) {
      // eslint-disable-next-line no-await-in-loop
      // of the github|bitbucket orgs a user belongs to, find ones that are registered in razee
      const orgFromDB = await models.Organization.findOne({ gheOrgId: org.gheOrgId }).lean();
      if (orgFromDB) {
        results.push({ name: orgFromDB.name, id: orgFromDB._id });
      }
    }
  }
  return results;
};

UserDefaultSchema.statics.getOrgById = async function(models, orgId) {
  return await models.Organization.findOne({ _id: orgId}).lean();
};

UserDefaultSchema.statics.getOrg = async function(models, me) {
  return await models.Organization.findOne({ orgKeys: me.orgKey }).lean({ virtuals: true });
};

UserDefaultSchema.statics.getBasicUsersByIds = async function(ids){
  if(!ids || ids.length < 1){
    return {};
  }
  var users = await this.find({ _id: { $in: ids } }, { }, { lean: 1 });
  users = users.map((user)=>{
    var id = user._id;
    var name = _.get(user, 'profile.name') || _.get(user, 'service.default.username') || id;
    return {
      id,
      name,
    };
  });
  users = _.keyBy(users, 'id');
  users['undefined'] = {id: 'undefined', name: 'undefined'};
  return users;
};

UserDefaultSchema.methods.getId = async function() {
  return this._id;
};

UserDefaultSchema.methods.getEmail = async function() {
  return this.services.default.email;
};

UserDefaultSchema.methods.getIdentifier = async function() {
  return this.services.default.email;
};

UserDefaultSchema.methods.getMeta = async function() {
  return this.meta;
};

UserDefaultSchema.methods.getCurrentOrgId = async function() {
  return this.meta.orgs[0]._id;
};

UserDefaultSchema.methods.getCurrentRole = async function() {
  return null;
};

module.exports = UserDefaultSchema;
