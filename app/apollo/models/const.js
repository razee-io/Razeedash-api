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

const {ACTIONS, TYPES } = require('../../utils/auth.consts');

const AUTH_MODELS = {
  LOCAL: 'local',
  PASSPORT_LOCAL: 'passport.local',
  PASSPORT_GITHUB: 'passport.github',
  IAM: 'iam',
};

const AUTH_MODEL = process.env.AUTH_MODEL || AUTH_MODELS.LOCAL;
const SECRET = process.env.SECRET || 'very-very-secret';
const GRAPHQL_PATH = process.env.GRAPHQL_PATH || '/graphql';
const APOLLO_STREAM_SHARDING = process.env.APOLLO_STREAM_SHARDING === 'false' ? false : true;

module.exports = { ACTIONS, TYPES, AUTH_MODELS, AUTH_MODEL, SECRET, GRAPHQL_PATH , APOLLO_STREAM_SHARDING };

