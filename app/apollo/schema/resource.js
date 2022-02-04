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

const resourceSchema = gql`

  type ClusterInfo {
    clusterId: String!
    name: String!
  }

  type Resource {
    id: ID!
    orgId: String!
    clusterId: String!
    cluster: Cluster
    histId: String!
    selfLink: String
    hash: String
    data: JSON
    deleted: Boolean
    created: Date
    updated: Date
    lastModified: Date
    searchableData: JSON!
    searchableDataHash: String
    subscription: ChannelSubscription
  }

  type ResourceUpdated {
    resource: Resource!
    op: String!
  }

  type ResourcesList {
    count: Int
    totalCount: Int
    resources: [Resource!]!
  }

  type ResourceHistObj{
    id: String!
    updated: Date!
  }
  type ResourceHistList{
    count: Int
    totalCount: Int
    items: [ResourceHistObj!]!
  }
  type ResourceContentObj{
    id: String!
    histId: String!
    content: String!
    updated: Date!
  }
  type ClusterResourcesSyncResponse{
    success: Boolean!
  }
  
  extend type Query {
    """
    Return total resource count for given **orgId**.
    """
    resourcesCount(orgId: String!): Int

    """
    Search resources against **orgId**, **filter** string, and date ranges.
    """
    resources(
      orgId: String!,
      filter: String,
      mongoQuery: JSON,
      fromDate: Date,
      toDate: Date,
      limit: Int = 500,
      skip: Int = 0,
      kinds: [String!],
      sort: [SortObj!],
      subscriptionsLimit: Int = 500
    ): ResourcesList!

    """
    Search resources against **orgId**, **clusterId**, **filter** string, and date ranges.
    """
    resourcesByCluster(orgId: String! @sv, clusterId: String! @sv, filter: String @sv, limit: Int = 500, skip: Int = 0): ResourcesList!

    """
    Return the resource by given resource **id**.
    """
    resource(orgId: String! @sv, id: String! @sv, histId: String @sv): Resource

    """
    return the resource by given **orgId**, **clusterId** and **selfLink** of the resource.
    """
    resourceByKeys(orgId: String! @sv, clusterId: String! @sv, selfLink: String! @sv): Resource

    """
    Search resources against **orgId** and **subscriptionId**.
    """
    resourcesBySubscription(orgId: String! @sv, subscriptionId: String! @sv, limit: Int = 500, skip: Int = 0): ResourcesList!
    """
    Gets the yaml history for a resource
    """
    resourceHistory(orgId: String! @sv, clusterId: String! @sv, resourceSelfLink: String! @sv, beforeDate: Date, afterDate: Date, limit: Int = 20, skip: Int = 0): ResourceHistList!

    """
    Gets the content for a yaml hist item
    """
    resourceContent(orgId: String! @sv, clusterId: String! @sv, resourceSelfLink: String! @sv, histId: String @sv): ResourceContentObj
  }
  
  input ResourceChange{
    type: String!
    object: JSON
  }
  
  type UpdateClusterResourcesResponse{
    success: Boolean!
  }
  
  extend type Mutation{
    """
    Updates resources in the clusters
    """
    updateClusterResources(orgId: String! @sv, clusterId: String! @sv, resourceChanges: [ResourceChange]!): UpdateClusterResourcesResponse
    
    """
    Syncs removed and new data in the cluster
    """
    clusterResourcesSync(orgId: String! @sv, clusterId: String! @sv): ClusterResourcesSyncResponse!
  }

  extend type Subscription {
    resourceUpdated(orgId: String! @sv, filter: String @sv): ResourceUpdated!
  }
`;

module.exports = resourceSchema;
