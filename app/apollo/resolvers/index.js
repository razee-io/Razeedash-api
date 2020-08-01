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

const { GraphQLDateTime } = require('graphql-iso-date');
const GraphQLJSON = require('graphql-type-json');

const userResolvers = require('./user');
const resourceResolvers = require('./resource');
const resourceDistributedResolvers = require('./resourceDistributed');
const groupResolvers = require('./group');
const clusterResolvers = require('./cluster');
const channelResolvers = require('./channel');
const subscriptionResolvers = require('./subscription');
const clusterDistributedResolvers = require('./clusterDistributed');
const organizationResolvers = require('./organization');

const customScalarResolver = {
  //Date: GraphQLDate, 
  DateTime: GraphQLDateTime,
  JSON: GraphQLJSON,
};

const resolvers = [
  customScalarResolver,
  organizationResolvers,
  userResolvers,
  resourceResolvers,
  resourceDistributedResolvers,
  groupResolvers,
  clusterResolvers,
  subscriptionResolvers,
  channelResolvers,
  clusterDistributedResolvers,
];

module.exports = resolvers;
