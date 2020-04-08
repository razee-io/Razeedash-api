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

const channelSchema = gql`
  
  type ChannelVersion {
    uuid: String!
    name: String!
    description: String
    location: String!  
  }
  type Channel {
    _id: ID!
    org_id: String!
    name: String!
    uuid: String!
    created: Date!
    versions: [ChannelVersion]
  }
  type AddChannelReply {
    _id: String!
  }
  type EditChannelReply {
    _id: String!
    name: String!
    success: Boolean
  }
  type AddChannelVersionReply {
    version_uuid: String!
    success: Boolean!
  }
  type RemoveChannelReply {
    _id: String!
    success: Boolean
  }
  
  extend type Query {
     """
     Gets all channels for org_id
     """
     channels(org_id: String!): [Channel]
  }
  extend type Mutation {
     """
     Adds a channel
     """
     addChannel(org_id: String!, name: String!): AddChannelReply!
     
     """
     Edits a channel
     """
     editChannel(org_id: String!, _id: String!, name: String!): EditChannelReply!
     
     """
     Adds a yaml version to this channel
     """
     addChannelVersion(org_id: String!, channel_id: String!, name: String!, type: String!, content: String!, description: String): AddChannelVersionReply!
     
     """
     Removes a channel
     """
     removeChannel(org_id: String!, _id: String!): RemoveChannelReply!
  }
`;

module.exports = channelSchema;
