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
  type Comment {
    user_id: String
    content: String
    created: Date
  }

  type Cluster {
    _id: ID!
    org_id: String!
    cluster_id: String!
    state: String
    metadata: JSON
    comments: [Comment]
    registration: JSON
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

  type DeleteClustersResponse {
    deletedClusterCount: Int,
    deletedResourceCount: Int
  }

  extend type Query {
    """
    Return a cluster based on **org_id** and **cluster_id**.
    """
    clusterByClusterID(org_id: String!, cluster_id: String!): Cluster!

    """
    Return clusters based on **org_id**, sorted with newest document first.
    """
    clustersByOrgID(
      org_id: String!
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
      "**startingAfter**: For pagination. Specify the **_id** of the document you want results older than."
      startingAfter: String
    ): [Cluster]!

    """
    Return clusters based on **org_id** and **filter** on **cluster_id**. Sorted with newest document first.
    """
    clusterSearch(
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
    Sorted with newest document first.
    """
    clusterZombies(
      org_id: String!
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]

    """
    Return counts of different kubernetes versions deployed in **org_id**. Only active
    clusters are counted (**updated** field updated in last day).
    """
    clusterCountByKubeVersion(org_id: String!): [ClusterCountByKubeVersion]!
  }

  extend type Mutation {
    """
    Delete a cluster and all resources under the cluster
    """
    deleteClusterByClusterID(org_id: String!, cluster_id: String!): DeleteClustersResponse!

    """
    Delete all clusters under an organization and all resources under the deleted clusters
    """
    deleteClusters(org_id: String!): DeleteClustersResponse!

    """
    register a cluster under an organization
    """ 
    registerCluster (
      org_id: String!, 
      "**registration** the cluster registration data, name of the cluster is required"
      registration: JSON!
    ): URL!
  }

`;

module.exports = clusterSchema;
