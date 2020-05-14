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

const mongoose = require('mongoose');
const { AuthenticationError } = require('apollo-server');

const { AUTH_MODEL } = require('./const');
const UserSchema = require(`./user.${AUTH_MODEL}.schema`);
const _ = require('lodash');

const loadMeFromUserToken = async function(userToken){
  const user = await this.findOne({ apiKey: userToken }, {}, { lean:true });
  if(!user){
    throw new AuthenticationError('No user found for userToken');
  }
  return {
    type: 'userToken',
    user,
  };
};

const getMeFromConnectionParamsBase = UserSchema.statics.getMeFromConnectionParams;
UserSchema.statics.getMeFromConnectionParams = async function(...args){
  const [, {models, userToken}] = args;

  if(userToken){
    return await loadMeFromUserToken.bind(this)(userToken, models);
  }

  return await getMeFromConnectionParamsBase.bind(this)(...args);
};

const getMeFromRequestBase = UserSchema.statics.getMeFromRequest;
UserSchema.statics.getMeFromRequest = async function(...args){
  const [req, {models}] = args;
  const userToken = req.get('userToken');

  if(userToken){
    return await loadMeFromUserToken.bind(this)(userToken, models);
  }

  return await getMeFromRequestBase.bind(this)(...args);
};

UserSchema.statics.getBasicUsersByIds = async function(ids){
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

const User = mongoose.model('users', UserSchema);

module.exports = { User };
