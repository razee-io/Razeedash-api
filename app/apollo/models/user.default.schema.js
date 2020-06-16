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
const { AUTH_MODELS, AUTH_MODEL } = require('./const');
const { getBunyanConfig } = require('../../utils/bunyan');

const _ = require('lodash');

const logger = bunyan.createLogger(
  getBunyanConfig('apollo/models/user.default.schema'),
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
  meta: {
    orgs: [
      {
        _id: {
          type: String,
        }
      },
    ],
  },
});

UserDefaultSchema.statics.getMeFromRequest = async function(req, context) {
  const {req_id, logger} = context;
  const apiKey = req.get('x-api-key');
  const orgKey = req.get('razee-org-key');

  logger.debug({ req_id }, 'default getMeFromRequest');
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    let type = apiKey ? 'userToken': 'cluster';
    return {apiKey, orgKey, type}; 
  }
  return null;
};

UserDefaultSchema.statics.getMeFromConnectionParams = async function(connectionParams, context){
  const {req_id, logger} = context;
  logger.debug({ req_id, connectionParams }, 'default getMeFromConnectionParams');
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    const obj = connectionParams.headers['razee-org-key'];
    return obj;
  }
  return null;
};

UserDefaultSchema.statics.userTokenIsAuthorized = async function(me, orgId, action, type, context) {
  const {req_id, models, logger} = context;
  logger.debug({ req_id: req_id }, `default userTokenIsAuthorized ${action} ${type}`);

  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
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
  }
  return false;
};

UserDefaultSchema.statics.isAuthorized = async function(me, orgId, action, type, attributes, req_id) {
  logger.debug({ req_id: req_id },`default isAuthorized ${action} ${type} ${attributes}`);

  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    const user = await this.findOne({ apiKey: me.apiKey }).lean();
    if(!user) {
      logger.error('A user was not found for this apiKey');
      throw new ForbiddenError('user not found');
    }
    logger.debug('user found using apiKey', user);
    return user;
  }
  return false;
};

UserDefaultSchema.statics.isValidOrgKey = async function(models, me) {
  logger.debug('default isValidOrgKey');
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {

    const org = await models.Organization.findOne({ orgKeys: me.orgKey }).lean();
    if(!org) {
      logger.error('An org was not found for this razee-org-key');
      throw new ForbiddenError('org id was not found');
    }
    logger.debug('org found using orgKey');
    return org;
  }
  return false;
};

UserDefaultSchema.statics.getOrgs = async function(models, me) {
  const results = [];
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    const meFromDB = await models.User.findOne({ _id: me.userId });
    if (meFromDB && meFromDB.meta.orgs) {
      // eslint-disable-next-line no-restricted-syntax
      for (const org of meFromDB.meta.orgs) {
        // eslint-disable-next-line no-await-in-loop
        const orgFromDB = await models.Organization.findOne({ _id: org._id }).lean();
        if (orgFromDB) {
          results.push({ name: orgFromDB.name, _id: org._id });
        }
      }
    }
  }
  return results;
};

UserDefaultSchema.statics.getOrgById = async function(models, orgId) {
  let org;
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    org = await models.Organization.findOne({ _id: orgId}).lean();
  }
  return org;
};

UserDefaultSchema.statics.getOrg = async function(models, me) {
  let org;
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    org = await models.Organization.findOne({ orgKeys: me.orgKey }).lean();
  }
  return org;
};

UserDefaultSchema.statics.getBasicUsersByIds = async function(ids){
  if(!ids || ids.length < 1){
    return [];
  }
  var users = await this.find({ _id: { $in: ids } }, { }, { lean: 1 });
  users = users.map((user)=>{
    var _id = user._id;
    var name = _.get(user, 'profile.name') || _.get(user, 'services.local.username') || _id;
    return {
      _id,
      name,
    };
  });
  users = _.keyBy(users, '_id');
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
