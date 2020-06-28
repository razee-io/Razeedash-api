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
    """
    Return a cluster based on **orgId** and **clusterId**. Multiple DBs will be searched if configured.
    """
    clusterDistributedByClusterID(orgId: String!, clusterId: String!): Cluster

    """
    Return clusters based on **orgId** from multiple DBs if configured.
    """
    clustersDistributedByOrgID(
      orgId: String
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]!

    """
    Return clusters based on **orgId** and **filter** on **cluster_id** from multiple DBs if configured.
    """
    clusterDistributedSearch(
      orgId: String!
      """
      **filter**: applies to **cluster_id** field.
      If no **filter** is provided, this returns clusters based on just **orig_id**.
      """
      filter: String
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]!

    """
    Return clusters based on **orgId** whose *updated* field has not been updated in the past day.
    Mulitple DBs will be searched if configured.
    """
    clusterDistributedZombies(
      orgId: String!
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]

    """
    Return counts of different kubernetes versions deployed in **orgId**. Only active
    clusters are counted (**updated** field updated in last day). Mulitple DBs will be searched if configured.
    """
    clusterDistributedCountByKubeVersion(
      orgId: String!
    ): [ClusterCountByKubeVersion]!
  }
`;

module.exports = clusterDistributedSchema;
