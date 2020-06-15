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
    created: Date
  }
  type Channel {
    uuid: String!
    org_id: String!
    name: String!
    created: Date!
    versions: [ChannelVersion]
  }
  type AddChannelReply {
    uuid: String!
  }
  type EditChannelReply {
    uuid: String!
    name: String!
    success: Boolean
  }
  type AddChannelVersionReply {
    version_uuid: String!
    success: Boolean!
  }
  type uploadChannelVersionReply{
    uuid: String!
    success: Boolean
  }
  type RemoveChannelReply {
    uuid: String!
    success: Boolean
  }
  type RemoveChannelVersionReply {
    uuid: String!
    success: Boolean
  }
  type DeployableVersion {
    org_id: String!
    uuid: String!
    channel_id: String!
    channel_name: String!
    name: String!
    type: String!
    description: String
    content: String
    created: Date!
  }
  type DeployableVersionList{
    count: Int
    versions: [DeployableVersion!]
  }

  extend type Query {
     """
     Gets all channels for org_id
     """
     channels(org_id: String!): [Channel]

     """
     Gets a channel from the given org_id and uuid
     """
     channel(org_id: String!, uuid: String! ): Channel

     """
     Gets a yaml version from this channel
     """
     getChannelVersion(org_id: String!, channel_uuid: String!, version_uuid: String!): DeployableVersion!
     
     """
     Lets the $limit most recent versions for a channel
     """
     getChannelVersions(org_id: String!, channel_uuid: String!, limit: Int = 500): DeployableVersionList!

  }
  extend type Mutation {
     """
     Adds a channel
     """
     addChannel(org_id: String!, name: String!): AddChannelReply!
     
     """
     Edits a channel
     """
     editChannel(org_id: String!, uuid: String!, name: String!): EditChannelReply!
     
     """
     Adds a yaml version to this channel
     Requires either content:String or file:Upload
     """
     addChannelVersion(org_id: String!, channel_uuid: String!, name: String!, type: String!, content: String, file: Upload, description: String): AddChannelVersionReply!

     """
     upload content for this channel version
     """
     uploadChannelVersion(org_id: String!, uuid: String!, content: String, file: Upload): uploadChannelVersionReply!
     
     """
     Removes a channel
     """
     removeChannel(org_id: String!, uuid: String!): RemoveChannelReply!

     """
     Removes a channel version
     """
     removeChannelVersion(org_id: String!, uuid: String!): RemoveChannelVersionReply!
  }
`;

module.exports = channelSchema;
