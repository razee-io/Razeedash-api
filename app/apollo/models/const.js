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

const config = require('config');

const {ACTIONS, TYPES, AUTH_MODELS, AUTH_MODEL } = require('../../utils/auth.consts');

const SECRET = process.env.SECRET || 'very-very-secret';
const GRAPHQL_PATH = process.env.GRAPHQL_PATH || '/graphql';
const APOLLO_STREAM_SHARDING = process.env.APOLLO_STREAM_SHARDING === 'false' ? false : true;
const CLUSTER_MAX_TOTAL_LIMIT = process.env.CLUSTER_MAX_TOTAL_LIMIT || 1000;
const RESOURCE_MAX_TOTAL_LIMIT = process.env.RESOURCE_MAX_TOTAL_LIMIT || 500000;
const CHANNEL_MAX_TOTAL_LIMIT = process.env.CHANNEL_MAX_TOTAL_LIMIT || 1000;
const CHANNEL_VERSION_MAX_TOTAL_LIMIT = process.env.CHANNEL_VERSION_MAX_TOTAL_LIMIT || 1000;
const SUBSCRIPTION_MAX_TOTAL_LIMIT = process.env.SUBSCRIPTION_MAX_TOTAL_LIMIT || 1000;

// Set Yaml file maximum size allowed in MB
const CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB = process.env.CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB || 2;

// controls static args to be passed to reazeedeploy-job 
const RDD_STATIC_ARGS = process.env.RDD_STATIC_ARGS ? process.env.RDD_STATIC_ARGS.split(',') : [];

const CLUSTER_LIMITS = {
  MAX_TOTAL: CLUSTER_MAX_TOTAL_LIMIT, // max total cluster allowed per account
  MAX_PENDING: 512  // max clusters are under register and pending states
};

const RESOURCE_LIMITS = {
  MAX_TOTAL: RESOURCE_MAX_TOTAL_LIMIT, // max total resources allowed per account
};

const CHANNEL_LIMITS = {
  MAX_TOTAL: CHANNEL_MAX_TOTAL_LIMIT, // max total channels allowed per account
};

const CHANNEL_VERSION_LIMITS = {
  MAX_TOTAL: CHANNEL_VERSION_MAX_TOTAL_LIMIT, // max total channel versions allowed per channel
};

const SUBSCRIPTION_LIMITS = {
  MAX_TOTAL: SUBSCRIPTION_MAX_TOTAL_LIMIT, // max total subscriptions allowed per account
};

const CLUSTER_REG_STATES = {
  REGISTERING: 'registering', // cluster db entry is created
  PENDING: 'pending', // razeedeploy-job yaml is downloaded, maybe already applied to the target cluster
  REGISTERED: 'registered',  // watch-keeper reported heat-beat back
};

const DIRECTIVE_LIMITS = {
  MAX_STRING_LENGTH: config.has('directive_limits.max_string_length') ? config.get('directive_limits.max_string_length') : 256,
  MIN_STRING_LENGTH: config.has('directive_limits.min_string_length') ? config.get('directive_limits.min_string_length') : 1,
  MAX_CONTENT_LENGTH: config.has('directive_limits.max_content_length') ? config.get('directive_limits.max_content_length') : CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB * 1024 * 1024,
  MAX_JSON_KEY_LENGTH: config.has('directive_limits.max_json_key_length') ? config.get('directive_limits.max_json_key_length') : 256,
  MAX_JSON_VALUE_LENGTH: config.has('directive_limits.max_json_value_length') ? config.get('directive_limits.max_json_value_length') : 1000,
  MAX_JSON_ITEMS: config.has('directive_limits.max_json_items') ? config.get('directive_limits.max_json_items') : 128,
  MAX_CLUSTER_ARRAY_LENGTH: CLUSTER_MAX_TOTAL_LIMIT,
  MAX_GROUP_ARRAY_LENGTH: config.has('directive_limits.max_group_array_length') ? config.get('directive_limits.max_group_array_length') : 32,
  INVALID_PATTERN: /[<>$%&!@()}{"#]{1,}/,
};

// console.log('NODE_ENV: ' + config.util.getEnv('NODE_ENV') + `, DIRECTIVE_LIMITS: ${JSON.stringify(DIRECTIVE_LIMITS)}`);

module.exports = { RDD_STATIC_ARGS, ACTIONS, TYPES, AUTH_MODELS, AUTH_MODEL, SECRET, GRAPHQL_PATH , APOLLO_STREAM_SHARDING,
  CLUSTER_LIMITS, RESOURCE_LIMITS, CHANNEL_LIMITS, CHANNEL_VERSION_LIMITS, SUBSCRIPTION_LIMITS, CLUSTER_REG_STATES, CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB, DIRECTIVE_LIMITS};
