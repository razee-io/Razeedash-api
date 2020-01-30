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

const clusterSchema = gql`
  type KubeVersion {
    major: String!
    minor: String!
    gitVersion: String
    gitCommit: String
    gitTreeState: String
    buildDate: String
    compiler: String
    platform: String
  }

  type Metadata {
    kube_version: KubeVersion
  }

  type Comment {
    user_id: String
    content: String
    created: Date
  }

  type Cluster {
    _id: ID!
    org_id: String!
    cluster_id: String!
    metadata: Metadata!
    comments: [Comment]
    created: Date
    updated: Date
    dirty: Boolean
  }

  type KubeCountVersion {
    major: String
    minor: String
  }

  type ClusterCountByKubeVersion {
    _id: KubeCountVersion
    count: Int
  }

  extend type Query {
    """
    Return a cluster based on **org_id** and **cluster_id**.
    """
    clusterByClusterID(org_id: String!, cluster_id: String!): Cluster!

    """
    Return all clusters based on **org_id**.
    """
    clustersByOrgID(org_id: String, limit: Int = 50): [Cluster]!

    """
    Return clusters based on **org_id** and filter on **cluster_id**.
    """
    clusterSearch(
      org_id: String!
      """
      **filter** applies to **cluster_id** field.
      If no **filter** is provided, this returns clusters based on just **orig_id**.
      """
      filter: String
      "If no **limit** is provided, a max of 50 clusters will be returned."
      limit: Int = 50
    ): [Cluster]!

    """
    Return clusters whose *updated* field has not been updated in the past day.
    """
    clusterZombies(org_id: String!, limit: Int = 50): [Cluster]

    """
    Return counts of different kubernetes versions deployed in **org_id**. Only active
    clusters are counted (**updated** field updated in last day).
    """
    clusterCountByKubeVersion(org_id: String!): [ClusterCountByKubeVersion]!
  }
`;

module.exports = clusterSchema;
