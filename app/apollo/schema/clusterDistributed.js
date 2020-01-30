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

const clusterDistributedSchema = gql`
  extend type Query {
    clusterDistributedByClusterID(org_id: String!, cluster_id: String!): Cluster
    clustersDistributedByOrgID(org_id: String, limit: Int = 50): [Cluster]!
    clusterDistributedSearch(
      org_id: String!
      filter: String
      limit: Int = 50
    ): [Cluster]!
    clusterDistributedZombies(org_id: String!, limit: Int = 50): [Cluster]
    clusterDistributedCountByKubeVersion(
      org_id: String!
    ): [ClusterCountByKubeVersion]!
  }
`;

module.exports = clusterDistributedSchema;
