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

const { gql } = require('apollo-server-express');

const userSchema = require('./user');
const resourceSchema = require('./resource');
const resourceDistributedSchema = require('./resourceDistributed');
const groupSchema = require('./group');
const clusterSchema = require('./cluster');
const channelSchema = require('./channel');
const subscriptionSchema = require('./subscription');
const clusterDistributedSchema = require('./clusterDistributed');
const organizationSchema = require('./organization');

const linkSchema = gql`

  directive @identifier(min: Int, max: Int) on ARGUMENT_DEFINITION

  scalar Date
  scalar DateTime
  scalar JSON

  type Query {
    _: Boolean
  }

  type Mutation {
    _: Boolean
  }

  type Subscription {
    _: Boolean
  }
  
  input SortObj {
    field: String!
    desc: Boolean = false
  }
`;

const schemas = [ linkSchema,
  organizationSchema,
  userSchema,
  resourceSchema,
  resourceDistributedSchema,
  groupSchema,
  clusterSchema,
  channelSchema,
  subscriptionSchema,
  clusterDistributedSchema ];

module.exports = schemas;
