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

const bcrypt = require('bcrypt');
const bunyan = require('bunyan');
const isEmail = require('validator/lib/isEmail');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { v4: uuid } = require('uuid');

const { AuthenticationError, ForbiddenError } = require('apollo-server');
const _ = require('lodash');

const { ACTIONS, AUTH_MODEL } = require('./const');
const { getBunyanConfig } = require('../../utils/bunyan');
const SECRET = require('./const').SECRET;

const logger = bunyan.createLogger(
  getBunyanConfig('razeedash-api/apollo/models/user.passport.local.schema'),
);

const UserPassportLocalSchema = new mongoose.Schema({
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
  profile: {
    currentOrgName: {
      type: String,
    },
  },

  services: {
    passportlocal: {
      username: {
        type: String,
        unique: true,
        required: true,
      },
      email: {
        type: String,
        unique: true,
        validate: [isEmail, 'No valid email address provided.'],
      },
      password: {
        type: String,
        required: true,
        minlength: 7,
        maxlength: 42,
      },
    },
  },

  meta: {
    orgs: [
      {
        _id: {
          type: String,
        },
        role: {
          type: String,
        },
      },
    ],
  },
}, {
  //strict:'throw', //dont do this since user objects are different based on auth model
});

async function getOrCreateOrganization(models, args) {
  const orgName = args.orgName || 'default_local_org';
  const org = await models.Organization.findOne({ name: orgName });
  if (org) return org;
  if (models.OrganizationDistributed) {
    const orgArray = await Promise.all(
      models.OrganizationDistributed.map(od => {
        return od.createLocalOrg({
          _id: `${uuid()}`,
          type: 'passpportlocal',
          name: orgName,
        });
      }),
    );
    return orgArray[0];
  }
  return models.Organization.createLocalOrg({
    _id: `${uuid()}`,
    type: 'passpportlocal',
    name: orgName,
  });
}

UserPassportLocalSchema.statics.createUser = async function(models, args) {
  const org = await getOrCreateOrganization(models, args);

  const user = await this.create({
    _id: `${uuid()}`,
    type: 'passportlocal',
    services: {
      passportlocal: {
        username: args.username,
        email: args.email,
        password: args.password,
      },
    },
    meta: {
      orgs: [
        {
          _id: org._id,
          name: org.name,
          role: args.role === 'ADMIN' ? 'ADMIN' : 'READER',
        },
      ],
    },
  });
  return user;
};

UserPassportLocalSchema.statics.findByLogin = async function(login) {
  let user = await this.findOne({
    'services.passportlocal.username': login,
  });
  if (!user) {
    user = await this.findOne({ 'services.passportlocal.email': login });
  }
  return user;
};

UserPassportLocalSchema.statics.createToken = async (
  user,
  secret,
  expiresIn,
) => {
  const claim = {
    _id: user._id,
    type: user.type,
    email: user.services.passportlocal.email,
    identifier: user.services.passportlocal.email,
    username: user.services.passportlocal.username,
    role: user.meta.orgs[0].role,
    org_id: user.meta.orgs[0]._id,
    meta: user.meta
  };
  return jwt.sign(claim, secret, {
    expiresIn,
  });
};

UserPassportLocalSchema.statics.getKubeOwnerName = async(context)=>{ // eslint-disable-line no-unused-vars
  return null;
};

UserPassportLocalSchema.statics.getKubeOwnerId = async(context)=>{ // eslint-disable-line no-unused-vars
  return null;
};

UserPassportLocalSchema.statics.convertKubeOwnerIdsToNames = async(ids)=> {
  var out = {};
  _.each(ids, (id)=>{
    out[id] = null;
  });
  return out;
};

UserPassportLocalSchema.statics.getCurrentUser = ({me , req_id, logger}) => {
  let result = me;
  let data = me.meta.orgs[0];
  data.id = data._id;
  delete(data._id);

  if (result != null) {
    result = {
      type: me.type,
      id: me._id,
      email: me.email,
      identifier: me.identifier,
      orgId: me.org_id,
      role: me.role,
      meta: me.meta,
    };
  } else {
    logger.debug(`Can not locate the user for the user _id: ${me._id} for the request ${req_id}`);
  }
  return result;
};

UserPassportLocalSchema.statics.signUp = async (models, args, secret, context) => {
  logger.debug( { req_id: context.req_id }, `passport.local signUp: ${args}`);

  const user = await models.User.createUser(models, args);
  return { token: models.User.createToken(user, secret, '240m') };
};

UserPassportLocalSchema.statics.signIn = async (
  models,
  login,
  password,
  secret,
  context,
) => {
  const email = login;
  const { user, /* info */ } = await context.authenticate('graphql-local', {
    email,
    password,
  });
  if (!user) {
    logger.warn({ req_id: context.req_id }, 'Authentication has failed');
    throw new AuthenticationError('Authentication has failed');
  }
  return { token: models.User.createToken(user, secret, '240m') };
};

UserPassportLocalSchema.statics.getMeFromRequest = async function(req, context) {
  const {req_id, logger} = context;
  const orgKey = req.get('razee-org-key');
  if (orgKey) {
    // cluster facing api (e.g. subscriptionsByCluster)
    return {orgKey, type: 'cluster'};
  }
  // user facing api
  let token = req.headers['authorization'];
  if (token) {
    if (token.startsWith('Bearer ')) {
      // Remove Bearer from string
      token = token.slice(7, token.length);
    }
    try {
      return jwt.verify(token, SECRET);
    } catch (e) {
      logger.warn({ req_id }, 'getMeFromRequest Session expired');
      throw new Error('Your session expired. Sign in again.');
    }
  }
};

UserPassportLocalSchema.statics.getMeFromConnectionParams = async function(
  connectionParams,
  context
) {
  const {req_id, logger} = context;
  if (connectionParams.headers) {
    const orgKey = connectionParams.headers['razee-org-key'];
    if (orgKey) {
      // cluster facing api (e.g. subscriptionsByCluster)
      return {orgKey, type: 'cluster'};
    }
  }
  let token = connectionParams['authorization'];
  if (token) {
    if (token.startsWith('Bearer ')) {
      // Remove Bearer from string
      token = token.slice(7, token.length);
    }
    try {
      return jwt.verify(token, SECRET);
    } catch (e) {
      logger.warn({ req_id }, 'getMeFromConnectionParams Session expired');
      throw new Error('Your session expired. Sign in again.');
    }
  }
  return null;
};

UserPassportLocalSchema.statics.isValidOrgKey = async function(models, me) {
  logger.debug('default isValidOrgKey');

  const org = await models.Organization.findOne({ orgKeys: me.orgKey }).lean();
  if(!org) {
    logger.error('An org was not found for this razee-org-key');
    throw new ForbiddenError('org id was not found');
  }
  logger.debug('org found using orgKey');
  return org;
};

UserPassportLocalSchema.statics.userTokenIsAuthorizedBatch = async function(me, orgId, objectArray, context) {
  return this.isAuthorizedBatch(me.user, orgId, objectArray, context);
};

UserPassportLocalSchema.statics.isAuthorizedBatch = async function(me, orgId, objectArray, context) {
  const { req_id, logger, models } = context;
  logger.debug({ req_id, orgId, objectArray, me },'passport.local isAuthorizedBatch enter..');

  if (!me || me === null || me.type === 'cluster') {
    // say no for if it is cluster facing api
    logger.debug({ req_id, orgId, reason: 'me is empty or cluster type'},'passport.local isAuthorizedBatch exit..');
    var result = false;
    if(await models.User.isValidOrgKey(models, me)){
      result = true;
    }
    return new Array(objectArray.length).fill(result);
  }

  const orgMeta = me.meta.orgs.find((o)=>{
    return (o._id == orgId);
  });

  if (orgMeta) {
    const results = objectArray.map( o => {
      if (o.action === ACTIONS.READ) {
        return !!orgMeta;
      } else {
        return orgMeta.role === 'ADMIN';
      }
    });
    logger.debug({ req_id, orgId, results, me },'passport.local isAuthorizedBatch exit..');
    return results;
  }
  logger.debug({ req_id, orgId, orgMeta, AUTH_MODEL }, 'passport.local isAuthorizedBatch exit..');
  return new Array(objectArray.length).fill(false);
};

UserPassportLocalSchema.statics.userTokenIsAuthorized = async function(me, orgId, action, type, attributes, context) {
  return this.isAuthorized(me.user, orgId, action, type, attributes, context);
};

UserPassportLocalSchema.statics.isAuthorized = async function(me, orgId, action, type, attributes, context) {
  const { req_id, logger } = context;
  logger.debug({req_id}, `passport.local isAuthorized ${action} ${type} ${attributes}`);

  if (!me || me === null || me.type === 'cluster') {
    // say no for if it is cluster facing api
    return false;
  }

  if (action === ACTIONS.READ) {
    return me.org_id === orgId;
  } else {
    return me.org_id === orgId && me.role === 'ADMIN';
  }
};

UserPassportLocalSchema.statics.getOrg = async function(models, me) {
  let org;
  org = await models.Organization.findOne({ orgKeys: me.orgKey }).lean({ virtuals: true });
  return org;
};

UserPassportLocalSchema.statics.getOrgs = async function(context) {
  const results = [];
  const { models, me } = context;
  const meFromDB = await models.User.findOne({ _id: me._id });
  if (meFromDB && meFromDB.meta.orgs) {
    // eslint-disable-next-line no-restricted-syntax
    for (const org of meFromDB.meta.orgs) {
      // eslint-disable-next-line no-await-in-loop
      const orgFromDB = await models.Organization.findOne({ _id: org._id });
      if (orgFromDB) {
        results.push({ name: orgFromDB.name, id: org._id });
      }
    }
  }
  return results;
};

UserPassportLocalSchema.statics.getBasicUsersByIds = async function(ids){
  if(!ids || ids.length < 1){
    return {};
  }
  var users = await this.find({ _id: { $in: ids } }, { }, { lean: 1 });
  users = users.map((user)=>{
    var id = user._id;
    var name = _.get(user, 'profile.name') || _.get(user, 'services.passportlocal.username') || id;
    return {
      id,
      name,
    };
  });
  users = _.keyBy(users, 'id');
  users['undefined'] = {id: 'undefined', name: 'undefined'};
  return users;
};

UserPassportLocalSchema.pre('save', async function() {
  this.services.passportlocal.password = await this.generatePasswordHash();
});

UserPassportLocalSchema.methods.generatePasswordHash = async function() {
  const saltRounds = 10;
  return bcrypt.hash(this.services.passportlocal.password, saltRounds);
};

UserPassportLocalSchema.methods.validatePassword = function(password) {
  return bcrypt.compareSync(password, this.services.passportlocal.password);
};

UserPassportLocalSchema.methods.getId = async function() {
  return this._id;
};

UserPassportLocalSchema.methods.getEmail = async function() {
  return this.services.passportlocal.email;
};

UserPassportLocalSchema.methods.getIdentifier = async function() {
  return this.services.passportlocal.email;
};

UserPassportLocalSchema.methods.getMeta = async function() {
  return this.meta;
};

UserPassportLocalSchema.methods.getCurrentOrgId = async function() {
  return this.meta.orgs[0]._id;
};

UserPassportLocalSchema.methods.getCurrentRole = async function() {
  return this.meta.orgs[0].role;
};

module.exports = UserPassportLocalSchema;
