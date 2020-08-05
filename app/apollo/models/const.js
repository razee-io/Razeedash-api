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

const {ACTIONS, TYPES, AUTH_MODELS, AUTH_MODEL } = require('../../utils/auth.consts');

const SECRET = process.env.SECRET || 'very-very-secret';
const GRAPHQL_PATH = process.env.GRAPHQL_PATH || '/graphql';
const APOLLO_STREAM_SHARDING = process.env.APOLLO_STREAM_SHARDING === 'false' ? false : true;
const CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT = process.env.CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT || 30;

// controls static args to be passed to reazeedeploy-job 
const RDD_STATIC_ARGS = process.env.RDD_STATIC_ARGS ? process.env.RDD_STATIC_ARGS.split(',') : [];

const CLUSTER_LIMITS = {
  MAX_TOTAL: 20000, // max total cluster allowed per account
  MAX_PENDING: 512  // max clusters are under register and pending states
};

const CLUSTER_REG_STATES = {
  REGISTERING: 'registering', // cluster db entry is created
  PENDING: 'pending', // razeedeploy-job yaml is downloaded, maybe already applied to the target cluster
  REGISTERED: 'registered',  // watch-keeper reported heat-beat back
};

module.exports = { RDD_STATIC_ARGS, ACTIONS, TYPES, AUTH_MODELS, AUTH_MODEL, SECRET, GRAPHQL_PATH , APOLLO_STREAM_SHARDING,
  CLUSTER_LIMITS, CLUSTER_REG_STATES, CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT};

