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
const uuid = require('uuid');
const { AuthenticationError, UserInputError } = require('apollo-server');

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
          _id: `${uuid()}`,
          type: 'local',
          name: orgName,
        });
      }),
    );
    return orgArray[0];
  }
  return models.Organization.createLocalOrg({
    _id: `${uuid()}`,
    type: 'local',
    name: orgName,
  });
}

UserLocalSchema.statics.createUser = async function(models, args) {
  const org = await getOrCreateOrganization(models, args);

  const user = await this.create({
    _id: `${uuid()}`,
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

UserLocalSchema.statics.getMeFromRequest = async function(req) {
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    let token = req.headers['authorization'];
    if (token) {
      if (token.startsWith('Bearer ')) {
        // Remove Bearer from string
        token = token.slice(7, token.length);
      }
      try {
        return jwt.verify(token, SECRET);
      } catch (e) {
        logger.warn({ req_id: req.id }, 'Session expired');
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
    let token = connectionParams['authorization'];
    if (token) {
      if (token.startsWith('Bearer ')) {
        // Remove Bearer from string
        token = token.slice(7, token.length);
      }
      try {
        return jwt.verify(token, SECRET);
      } catch (e) {
        logger.warn({ req_id: context.req_id }, 'Session expired');
        throw new AuthenticationError('Your session expired. Sign in again');
      }
    }
  }
  return null;
};

UserLocalSchema.statics.isAuthorized = async function(me, orgId, action, type, attributes, req_id) {
  logger.debug({ req_id: req_id },`local isAuthorized ${me} ${action} ${type} ${attributes}`);
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    if (action === ACTIONS.READ) {
      return me.org_id === orgId;
    }
    if (action === ACTIONS.MANAGE || action === ACTIONS.WRITE) {
      return me.org_id === orgId && me.role === 'ADMIN';
    }
  }
  return false;
};

UserLocalSchema.statics.getOrgs = async function(models, me) {
  const results = [];
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

