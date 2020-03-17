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

const { AuthenticationError } = require('apollo-server');

const { ACTIONS, AUTH_MODELS, AUTH_MODEL } = require('./const');
const { getBunyanConfig } = require('../../utils/bunyan');
const SECRET = require('./const').SECRET;

const logger = bunyan.createLogger(
  getBunyanConfig('apollo/models/user.passport.local.schema'),
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

UserPassportLocalSchema.statics.signUp = async (models, args, secret) => {
  logger.debug(`passport.local signUp: ${args}`);
  if (AUTH_MODEL === AUTH_MODELS.PASSPORT_LOCAL) {
    const user = await models.User.createUser(models, args);
    return { token: models.User.createToken(user, secret, '240m') };
  }
  throw new AuthenticationError(
    `Current authorization model ${AUTH_MODEL} does not support this option.`,
  );
};

UserPassportLocalSchema.statics.signIn = async (
  models,
  login,
  password,
  secret,
  context,
) => {
  if (AUTH_MODEL === AUTH_MODELS.PASSPORT_LOCAL) {
    const email = login;
    const { user, /* info */ } = await context.authenticate('graphql-local', {
      email,
      password,
    });
    if (!user) {
      throw new AuthenticationError('Authentication has failed');
    }
    return { token: models.User.createToken(user, secret, '240m') };
  }
  throw new AuthenticationError(
    `Current authorization model ${AUTH_MODEL} does not support this option.`,
  );
};

UserPassportLocalSchema.statics.getMeFromRequest = async function(req) {
  if (AUTH_MODEL === AUTH_MODELS.PASSPORT_LOCAL) {
    let token = req.headers['authorization'];
    if (token) {
      if (token.startsWith('Bearer ')) {
        // Remove Bearer from string
        token = token.slice(7, token.length);
      }
      try {
        return jwt.verify(token, SECRET);
      } catch (e) {
        throw new Error('Your session expired. Sign in again.');
      }
    }
  }
  return null;
};

UserPassportLocalSchema.statics.getMeFromConnectionParams = async function(
  connectionParams,
) {
  if (AUTH_MODEL === AUTH_MODELS.PASSPORT_LOCAL) {
    let token = connectionParams['authorization'];
    if (token) {
      if (token.startsWith('Bearer ')) {
        // Remove Bearer from string
        token = token.slice(7, token.length);
      }
      try {
        return jwt.verify(token, SECRET);
      } catch (e) {
        throw new Error('Your session expired. Sign in again.');
      }
    }
  }
  return null;
};

UserPassportLocalSchema.statics.isAuthorized = async function(
  me,
  orgId,
  action,
  type,
  attributes
) {
  logger.debug(`passport.ocal isAuthorized ${me} ${action} ${type} ${attributes}`);
  if (AUTH_MODEL === AUTH_MODELS.PASSPORT_LOCAL && me) {
  // For passport.local auth we ignore type and attributes
    if (action === ACTIONS.READ) {
      return me.org_id === orgId;
    }
    if (action === ACTIONS.MANAGE || action === ACTIONS.WRITE) {
      return me.org_id === orgId && me.role === 'ADMIN';
    }
  }
  return false;
};

UserPassportLocalSchema.statics.getOrgs = async function(models, me) {
  const results = [];
  if (AUTH_MODEL === AUTH_MODELS.PASSPORT_LOCAL) {
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
  return this.services.local.email;
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
