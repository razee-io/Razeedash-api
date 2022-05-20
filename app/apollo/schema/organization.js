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

const organizationSchema = gql`
  type URL {
    url: String!
  }

  type Organization {
    id: ID!
    name: String!
  }

  type OrgKey {
    uuid: String!
    name: String!
    primary: Boolean!
    created: Date
    updated: Date
    key: String
  }

  type AddOrgKeyReply {
    uuid: String!
    key: String!
  }

  extend type Query {
    """
    Return Organizations the current user belongs to.
    """
    organizations: [Organization!]

    """
    List OrgKeys.
    """
    orgKeys(
      orgId: String! @sv
    ): [OrgKey!]

    """
    Get OrgKey.
    """
    orgKey(
      orgId: String! @sv
      uuid: String @sv
      name: String @sv
    ): OrgKey!
  }

  extend type Mutation {
    """
    Add OrgKey
    """
    addOrgKey (
      orgId: String! @sv
      name: String! @sv
      primary: Boolean! @sv
    ): AddOrgKeyReply!
  }
`;

module.exports = organizationSchema;
