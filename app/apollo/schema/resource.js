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
    cluster_id: String!
    name: String!
  }

  type Resource {
    _id: ID!
    org_id: String!
    cluster_id: String!
    cluster: ClusterInfo!
    selfLink: String!
    hash: String
    data: String
    deleted: Boolean
    created: Date
    updated: Date
    searchableData: JSON!
    searchableDataHash: String
  }

  type ResourceUpdated {
    resource: Resource!
    op: String!
  }

  extend type Query {
    """
    Return total resource count for given **org_id**.
    """
    resourcesCount(org_id: String!): Int

    """
    Search resources against **org_id**, **filter** string, and date ranges.
    """
    resources(org_id: String! filter: String fromDate: Date toDate: Date limit: Int = 500): [Resource!]

    """
    Search resources against **org_id**, **cluster_id**, **filter** string, and date ranges.
    """
    resourcesByCluster(org_id: String! cluster_id: String! filter: String limit: Int = 500): [Resource!]

    """
    Return the resource by given resource **_id**.
    """
    resource(org_id: String!, _id: String!): Resource

    """
    return the resource by given **org_id**, **cluster_id** and **selfLink** of the resource.
    """
    resourceByKeys(org_id: String! cluster_id: String! selfLink: String!): Resource

    """
    Search resources against **org_id** and **subscription_id**.
    """
    resourcesBySubscription(org_id: String! subscription_id: String!): [Resource!]
  }

  extend type Subscription {
    resourceUpdated(org_id: String!, filter: String): ResourceUpdated!
  }
`;

module.exports = resourceSchema;
