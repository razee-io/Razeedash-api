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

const resourceSchema = gql`
  scalar JSON
  
  type ClusterInfo {
    clusterId: String!
    name: String!
  }

  type Resource {
    id: ID!
    orgId: String!
    clusterId: String!
    cluster: ClusterInfo!
    selfLink: String!
    hash: String
    data: String
    deleted: Boolean
    created: Date
    updated: Date
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
    resources: [Resource!]!
  }
  
  type ResourceHistObj{
    id: String!
    updated: Date!
  }
  type ResourceHistList{
    count: Int
    items: [ResourceHistObj!]!
  }
  type ResourceContentObj{
    id: String!
    histId: String!
    content: String!
    updated: Date!
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
      fromDate: Date,
      toDate: Date,
      limit: Int = 500,
      kinds: [String!],
      sort: [SortObj!],
      subscriptionsLimit: Int = 500
    ): ResourcesList!

    """
    Search resources against **orgId**, **clusterId**, **filter** string, and date ranges.
    """
    resourcesByCluster(orgId: String! clusterId: String! filter: String limit: Int = 500): ResourcesList!

    """
    Return the resource by given resource **id**.
    """
    resource(orgId: String!, id: String!, histId: String): Resource

    """
    return the resource by given **orgId**, **clusterId** and **selfLink** of the resource.
    """
    resourceByKeys(orgId: String! clusterId: String! selfLink: String!): Resource

    """
    Search resources against **orgId** and **subscriptionId**.
    """
    resourcesBySubscription(orgId: String! subscriptionId: String!): ResourcesList!
    """
    Gets the yaml history for a resource
    """
    resourceHistory(orgId: String!, clusterId: String!, resourceSelfLink: String!, beforeDate: Date, afterDate: Date, limit: Int = 20): ResourceHistList!
    
    """
    Gets the content for a yaml hist item
    """
    resourceContent(orgId: String!, clusterId: String!, resourceSelfLink: String!, histId: String): ResourceContentObj
  }

  extend type Subscription {
    resourceUpdated(orgId: String!, filter: String): ResourceUpdated!
  }
`;

module.exports = resourceSchema;
