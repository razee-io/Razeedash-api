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
    userId: String
    content: String
    created: Date
  }

  type ClusterGroup {
    uuid: String!
    name: String!
  }

  type Cluster {
    id: ID!
    orgId: String!
    clusterId: String!
    metadata: JSON
    comments: [Comment]
    registration: JSON
    regState: String
    groups: [ClusterGroup]
    created: Date
    updated: Date
    dirty: Boolean
  }

  type KubeCountVersion {
    major: String
    minor: String
  }

  type ClusterCountByKubeVersion {
    id: KubeCountVersion
    count: Int
  }

  type DeleteClustersResponse {
    deletedClusterCount: Int,
    deletedResourceCount: Int
  }

  type RegisterClusterResponse {
    url: String!
    orgId: String!
    orgKey: String!
    clusterId: String!
    regState: String!
    registration: JSON!
  }

  extend type Query {
    """
    Return a cluster based on **orgId** and **clusterId**.
    """
    clusterByClusterID(orgId: String!, clusterId: String!): Cluster!

    """
    Return clusters based on **orgId**, sorted with newest document first.
    """
    clustersByOrgID(
      orgId: String!
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
      "**startingAfter**: For pagination. Specify the **_id** of the document you want results older than."
      startingAfter: String
    ): [Cluster]!

    """
    Return clusters based on **orgId** and **filter** on **cluster_id**. Sorted with newest document first.
    """
    clusterSearch(
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
    Sorted with newest document first.
    """
    clusterZombies(
      orgId: String!
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
    ): [Cluster]

    """
    Return counts of different kubernetes versions deployed in **org_id**. Only active
    clusters are counted (**updated** field updated in last day).
    """
    clusterCountByKubeVersion(orgId: String!): [ClusterCountByKubeVersion]!
  }

  extend type Mutation {
    """
    Delete a cluster and all resources under the cluster
    """
    deleteClusterByClusterID(orgId: String!, clusterId: String!): DeleteClustersResponse!

    """
    Delete all clusters under an organization and all resources under the deleted clusters
    """
    deleteClusters(orgId: String!): DeleteClustersResponse!

    """
    Register a cluster with razee api for an organization. registration.name is required.
    """ 
    registerCluster (
      orgId: String!
      registration: JSON!
    ): RegisterClusterResponse!
  }

`;

module.exports = clusterSchema;
