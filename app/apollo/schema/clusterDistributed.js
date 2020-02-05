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
    Return a cluster based on **org_id** and **cluster_id**. Multiple DBs will be searched if configured.
    """
    clusterDistributedByClusterID(org_id: String!, cluster_id: String!): Cluster

    """
    Return clusters based on **org_id** from multiple DBs if configured.
    """
    clustersDistributedByOrgID(
      org_id: String
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]!

    """
    Return clusters based on **org_id** and **filter** on **cluster_id** from multiple DBs if configured.
    """
    clusterDistributedSearch(
      org_id: String!
      """
      **filter**: applies to **cluster_id** field.
      If no **filter** is provided, this returns clusters based on just **orig_id**.
      """
      filter: String
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]!

    """
    Return clusters based on **org_id** whose *updated* field has not been updated in the past day.
    Mulitple DBs will be searched if configured.
    """
    clusterDistributedZombies(
      org_id: String!
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]

    """
    Return counts of different kubernetes versions deployed in **org_id**. Only active
    clusters are counted (**updated** field updated in last day). Mulitple DBs will be searched if configured.
    """
    clusterDistributedCountByKubeVersion(
      org_id: String!
    ): [ClusterCountByKubeVersion]!
  }
`;

module.exports = clusterDistributedSchema;
