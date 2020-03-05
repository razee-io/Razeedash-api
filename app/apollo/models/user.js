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

const { AUTH_MODELS, AUTH_MODEL } = require('./const');
const UserLocalSchema = require('./user.local.schema');
const UserPassportLocalSchema = require('./user.passport.local.schema');

let UserSchema = null;
if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
  UserSchema = UserLocalSchema;
} else if (AUTH_MODEL === AUTH_MODELS.PASSPORT_LOCAL) {
  UserSchema = UserPassportLocalSchema;
}

const User = mongoose.model('users', UserSchema);

module.exports = User;
