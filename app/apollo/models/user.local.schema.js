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
const { AuthenticationError, UserInputError, ForbiddenError} = require('apollo-server');
const _ = require('lodash');

const { ACTIONS, AUTH_MODELS, AUTH_MODEL } = require('./const');
const { getBunyanConfig } = require('../../utils/bunyan');

const SECRET = require('./const').SECRET;

const logger = bunyan.createLogger(
  getBunyanConfig('apollo/models/user.local.schema'),
);

const UserLocalSchema = new mongoose.Schema({
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
    local: {
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
});

async function getOrCreateOrganization(models, args) {
  const orgName = args.org_name || 'default_local_org';
  const org = await models.Organization.findOne({ name: orgName });
  if (org) return org;
  if (models.OrganizationDistributed) {
    const orgArray = await Promise.all(
      models.OrganizationDistributed.map(od => {
        return od.createLocalOrg({
          _id: uuid(),
          type: 'local',
          name: orgName,
        });
      }),
    );
    return orgArray[0];
  }
  return models.Organization.createLocalOrg({
    _id: uuid(),
    type: 'local',
    name: orgName,
  });
}

UserLocalSchema.statics.createUser = async function(models, args) {
  const org = await getOrCreateOrganization(models, args);

  const user = await this.create({
    _id: uuid(),
    type: 'local',
    services: {
      local: {
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

UserLocalSchema.statics.findByLogin = async function(login) {
  let user = await this.findOne({
    'services.local.username': login,
  });
  if (!user) {
    user = await this.findOne({ 'services.local.email': login });
  }
  return user;
};

UserLocalSchema.statics.createToken = async (user, secret, expiresIn) => {
  const claim = {
    _id: user._id,
    type: user.type,
    email: user.services.local.email,
    identifier: user.services.local.email,
    username: user.services.local.username,
    role: user.meta.orgs[0].role,
    org_id: user.meta.orgs[0]._id,
    meta: user.meta,
  };
  return jwt.sign(claim, secret, {
    expiresIn,
  });
};

UserLocalSchema.statics.getCurrentUser = ({me , req_id, logger}) => {
  let result = me;
  if (result != null) {
    result = {
      type: me.type,
      id: me._id,
      email: me.email,
      identifier: me.identifier,
      org_id: me.org_id,
      role: me.role,
      meta: me.meta,
    };
  } else {
    logger.debug(`Can not locate the user for the user _id: ${me._id} for the request ${req_id}`);
  }
  return result;
};

UserLocalSchema.statics.signUp = async (models, args, secret, context) => {
  logger.debug({ req_id: context.req_id }, `local signUp ${args}`);
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    const user = await models.User.createUser(models, args);
    return { token: models.User.createToken(user, secret, '240m') };
  }
  logger.warn(
    { req_id: context.req_id },
    `Current authorization model ${AUTH_MODEL} does not support this option.`
  );
  throw new AuthenticationError(
    `Current authorization model ${AUTH_MODEL} does not support this option.`,
  );
};

UserLocalSchema.statics.signIn = async (models, login, password, secret, context) => {
  logger.debug({login, req_id: context.req_id}, 'local signIn enter');
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    const user = await models.User.findByLogin(login);
    if (!user) {
      logger.warn({ req_id: context.req_id },'No user found with this login credentials.');
      throw new UserInputError('No user found with this login credentials.');
    }
    const isValid = await user.validatePassword(password);
    if (!isValid) {
      logger.warn({ req_id: context.req_id }, 'Invalid password.');
      throw new AuthenticationError('Invalid password.');
    }
    return { token: models.User.createToken(user, secret, '240m') };
  }
  logger.warn({ req_id: context.req_id },`Current authorization model ${AUTH_MODEL} does not support this option.`);
  throw new AuthenticationError(
    `Current authorization model ${AUTH_MODEL} does not support this option.`,
  );
};

UserLocalSchema.statics.getMeFromRequest = async function(req, context) {
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    const {req_id, logger} = context;
    const orgKey = req.get('razee-org-key');
    if (orgKey) {
      // cluster facing api (e.g. subscriptionsByTag)
      return {orgKey, type: 'cluster'};  
    }
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
        throw new AuthenticationError('Your session expired. Sign in again.');
      }
    }
  }
  return null;
};

UserLocalSchema.statics.getMeFromConnectionParams = async function(
  connectionParams,
  context
) {
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    if (connectionParams.headers) {
      const orgKey = connectionParams.headers['razee-org-key'];
      if (orgKey) {
        // cluster facing api (e.g. subscriptionsByTag)
        return {orgKey, type: 'cluster'};
      }
    }
    const {req_id, logger} = context;
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
        throw new AuthenticationError('Your session expired. Sign in again');
      }
    }
  }
  return null;
};

UserLocalSchema.statics.isValidOrgKey = async function(models, me) {
  logger.debug('default isValidOrgKey');
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {

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

UserLocalSchema.statics.isAuthorizedBatch = async function(me, orgId, objectArray, context) {
  const { req_id, logger } = context;
  logger.debug({ req_id, orgId, objectArray, me },'local isAuthorizedBatch enter..');

  if (!me || me === null || me.type === 'cluster') {
    // say no for if it is cluster facing api
    logger.debug({ req_id, orgId, reason: 'me is empty or cluster type', me },'local isAuthorizedBatch exit..');
    return new Array(objectArray.length).fill(false);
  }

  if (me.type === 'user') {
    me = me.user;
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
    logger.debug({ req_id, orgId, results, me },'local isAuthorizedBatch exit..');
    return results;
  }
  logger.debug({ req_id, orgId, me, orgMeta, AUTH_MODEL }, 'local isAuthorizedBatch exit..');
  return new Array(objectArray.length).fill(false);
};

UserLocalSchema.statics.userTokenIsAuthorized = async function(me, orgId, action, type, attributes, context) {
  return this.isAuthorized(me.user, orgId, action, type, attributes, context);
};

UserLocalSchema.statics.isAuthorized = async function(me, orgId, action, type, attributes, context) {
  const { req_id, logger } = context;
  logger.debug({ req_id },`local isAuthorized ${me} ${action} ${type} ${attributes}`);

  if (!me || me === null || me.type === 'cluster') {
    // say no for if it is cluster facing api
    return false;
  }
    
  const orgMeta = me.meta.orgs.find((o)=>{
    return (o._id == orgId);
  });
  if(!orgMeta){
    return false;
  }
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    if (action === ACTIONS.READ) {
      return !!orgMeta;
    } else {
      return orgMeta.role === 'ADMIN';
    }
  }
  return false;
};

UserLocalSchema.statics.getOrg = async function(models, me) {
  let org;
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    org = await models.Organization.findOne({ orgKeys: me.orgKey }).lean();
  }
  return org;
};

UserLocalSchema.statics.getOrgs = async function(context) {
  const results = [];
  const { models, me } = context;
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    const meFromDB = await models.User.findOne({ _id: me._id });
    if (meFromDB && meFromDB.meta.orgs) {
      // eslint-disable-next-line no-restricted-syntax
      for (const org of meFromDB.meta.orgs) {
        // eslint-disable-next-line no-await-in-loop
        const orgFromDB = await models.Organization.findOne({ _id: org._id });
        if (orgFromDB) {
          results.push({ name: orgFromDB.name, _id: org._id });
        }
      }
    }
  }
  return results;
};

UserLocalSchema.statics.getBasicUsersByIds = async function(ids){
  if(!ids || ids.length < 1){
    return {};
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
  users['undefined'] = {_id: 'undefined', name: 'undefined'};
  return users;
};

UserLocalSchema.pre('save', async function() {
  this.services.local.password = await this.generatePasswordHash();
});

UserLocalSchema.methods.generatePasswordHash = function() {
  const saltRounds = 10;
  return bcrypt.hashSync(this.services.local.password, saltRounds);
};

UserLocalSchema.methods.validatePassword = function(password) {
  return bcrypt.compareSync(password, this.services.local.password);
};

UserLocalSchema.methods.getId = async function() {
  return this._id;
};

UserLocalSchema.methods.getEmail = async function() {
  return this.services.local.email;
};

UserLocalSchema.methods.getIdentifier = async function() {
  return this.services.local.email;
};

UserLocalSchema.methods.getMeta = async function() {
  return this.meta;
};

UserLocalSchema.methods.getCurrentOrgId = async function() {
  return this.meta.orgs[0]._id;
};

UserLocalSchema.methods.getCurrentRole = async function() {
  return this.meta.orgs[0].role;
};

module.exports = UserLocalSchema;
