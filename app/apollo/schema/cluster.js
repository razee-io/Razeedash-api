/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
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
var { globalGraphqlInputs } = require('./common');

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

  type ClusterIdentity {
    id: String!
    syncDate: String!
    syncStatus: String!
    syncMessage: String
  }

  type BasicCluster {
    id: ID!
    orgId: String!
    clusterId: String!
    name: String
    registration: JSON
  }

  type Cluster {
    id: ID!
    orgId: String!
    clusterId: String!
    name: String
    metadata: JSON
    comments: [Comment]
    registration: JSON
    status: String
    regState: String
    groups: [ClusterGroup]
    syncedIdentities: [ClusterIdentity]
    groupObjs: [GroupDetail!]
    created: Date
    updated: Date
    dirty: Boolean
    resources: [Resource!]
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
    deletedResourceCount: Int,
    deletedResourceYamlHistCount: Int,
    deletedServiceSubscriptionCount: Int
  }

  type RegisterClusterResponse {
    url: String!
    orgId: String!
    orgKey: String!
    clusterId: String!
    regState: String!
    registration: JSON!
  }

  type EnableRegistrationUrlResponse {
    url: String!
  }

  extend type Query {
    """
    Return a cluster based on **orgId** and **clusterId**.
    """
    clusterByClusterId(
      orgId: String!, @sv
      clusterId: String! @sv
      ${globalGraphqlInputs}
    ): Cluster

    """
    Return a cluster based on **orgId** and **cluster name**.
    """
    clusterByName(
      orgId: String!, @sv
      clusterName: String! @sv
      ${globalGraphqlInputs}
    ): Cluster

    """
    Return clusters based on **orgId**, sorted with newest document first.
    """
    clustersByOrgId(
      orgId: String! @sv
      clusterId: String @sv
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
      "**startingAfter**: For pagination. Specify the **id** of the document you want results older than."
      startingAfter: String @sv
      ${globalGraphqlInputs}
    ): [Cluster]!

    """
    Return clusters based on **orgId** and **filter** on **clusterId**. Sorted with newest document first.
    """
    clusterSearch(
      orgId: String! @sv
      """
      **filter**: applies to **clusterId** field.
      If no **filter** is provided, this returns clusters based on just **origId**.
      """
      filter: String @sv
      mongoQuery: JSON,
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
      skip: Int = 0
      ${globalGraphqlInputs}
    ): [Cluster]!

    """
    Return clusters based on **orgId** whose *updated* field has not been updated in the past day.
    Sorted with newest document first.
    """
    inactiveClusters(
      orgId: String! @sv
      "**limit**: Number of docs to return. default 50, 0 means return all"
      limit: Int = 50
      ${globalGraphqlInputs}
    ): [Cluster]

    """
    Return counts of different kubernetes versions deployed in **orgId**. Only active
    clusters are counted (**updated** field updated in last day).
    """
    clusterCountByKubeVersion(orgId: String! @sv): [ClusterCountByKubeVersion]!
  }

  extend type Mutation {
    """
    Delete a cluster and all resources under the cluster
    """
    deleteClusterByClusterId(orgId: String! @sv, clusterId: String! @sv): DeleteClustersResponse!

    """
    Delete all clusters under an organization and all resources under the deleted clusters
    """
    deleteClusters(orgId: String! @sv): DeleteClustersResponse!

    """
    Register a cluster with razee api for an organization. registration.name is required.
    """
    registerCluster (
      orgId: String! @sv
      registration: JSON! @jv
    ): RegisterClusterResponse!

    """
    Enable registration URL
    """
    enableRegistrationUrl (
      orgId: String! @sv
      clusterId: String! @sv
    ): EnableRegistrationUrlResponse
  }

`;

module.exports = clusterSchema;
