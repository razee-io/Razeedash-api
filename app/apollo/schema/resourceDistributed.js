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

const resourceDistributedSchema = gql`
  extend type Query {
    """
    Return total resource count for given **org_id** from multiple DBs if configured.
    """
    resourcesDistributedCount(org_id: String!): Int

    """
    Search resources against **org_id**, **filter** string, and date ranges from multiple DBs if configured.
    """
    resourcesDistributed (org_id: String! filter: String fromDate: Date toDate: Date limit: Int = 50): [Resource!]

    """
    Search resources against **org_id**, **cluster_id**, **filter** string, and date ranges from multiple DBs if configured.
    """
    resourcesDistributedByCluster(org_id: String! cluster_id: String! filter: String limit: Int = 50): [Resource!]

    """
    Return the resource by given resource **_id** from multiple DBs if configured.
    """
    resourceDistributed (_id: ID!): Resource

    """
    return the resource by given **org_id**, **cluster_id** and **selfLink** of the resource from multiple DBs if configured.
    """   
    resourceDistributedByKeys(org_id: String! cluster_id: String! selfLink: String!): Resource
  }
`;

module.exports = resourceDistributedSchema;