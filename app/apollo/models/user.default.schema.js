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
const { v4: uuid } = require('uuid');
const { AuthenticationError } = require('apollo-server');

const { AUTH_MODELS, AUTH_MODEL } = require('./const');
const { getBunyanConfig } = require('../../utils/bunyan');

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

  services: {
    default: {
      username: {
        type: String,
        unique: true,
      },
      email: {
        type: String,
        unique: true,
      }
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

UserDefaultSchema.statics.createUser = async function(models, args) {

  const userId = args.userId || `${uuid()}`;
  const profile = args.profile || null;
  const services = args.services || { default: { username: null, email: null}};
  const meta = args.meta || { orgs: []};

  const user = await this.create({
    _id: userId,
    type: 'default',
    profile,
    services,
    meta
  });
  return user;
};

UserDefaultSchema.statics.signUp = async (models, args, secret, context) => {
  logger.debug({ req_id: context.req_id }, `default signUp ${args}`);
  logger.warn(
    { req_id: context.req_id },
    `Current authorization model ${AUTH_MODEL} does not support this option.`
  );
  throw new AuthenticationError(
    `Current authorization model ${AUTH_MODEL} does not support this option.`,
  );
};

UserDefaultSchema.statics.signIn = async (models, login, password, secret, context) => {
  logger.debug({ req_id: context.req_id }, `default signIn ${login}`);
  logger.warn(
    { req_id: context.req_id },
    `Current authorization model ${AUTH_MODEL} does not support this option.`
  );
  throw new AuthenticationError(
    `Current authorization model ${AUTH_MODEL} does not support this option.`,
  );
};

UserDefaultSchema.statics.getMeFromRequest = async function(req, context) {
  const userId = req.get('x-user-id');
  const apiKey = req.get('x-api-key');
  const {req_id, logger} = context;
  logger.debug({ req_id }, `default getMeFromRequest ${userId}`);
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    if (userId && apiKey) {
      return { userId, apiKey };
    }
  }
  return null;
};

UserDefaultSchema.statics.getMeFromConnectionParams = async function(
  connectionParams,
  context
) {
  const {req_id, logger} = context;
  logger.debug({ req_id }, `default getMeFromConnectionParams ${connectionParams}`);
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    const obj = connectionParams['authorization'];
    return obj;
  }
  return null;
};

UserDefaultSchema.statics.isAuthorized = async function(me, orgId, action, type, attributes, req_id) {
  logger.debug({ req_id: req_id },`default isAuthorized ${me} ${action} ${type} ${attributes}`);
  if (AUTH_MODEL === AUTH_MODELS.DEFAULT) {
    const user = await this.findOne({ _id: me.userId, apiKey: me.apiKey }).lean();
    if (user && user.meta && user.meta.orgs.length > 0) {
      return orgId === user.meta.orgs[0]._id;
    }
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

