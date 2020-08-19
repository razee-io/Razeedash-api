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
    orgId: String!
    name: String!
    created: Date!
    versions: [ChannelVersion]
    subscriptions: [ChannelSubscription]
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
    versionUuid: String!
    success: Boolean!
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
    orgId: String!
    uuid: String!
    channelId: String!
    channelName: String!
    name: String!
    type: String!
    description: String
    content: String
    created: Date!
  }

  extend type Query {
     """
     Gets all channels for orgId
     """
     channels(orgId: String! @sv): [Channel]

     """
     Gets a channel from the given orgId and uuid
     """
     channel(orgId: String! @sv, uuid: String! @sv): Channel

     """
     Gets a channel from the given orgId and channel name
     """
     channelByName(orgId: String! @sv, name: String! @sv): Channel

     """
     Gets a channel version info from this channel uuid and version uuid 
     """
     channelVersion(orgId: String! @sv, channelUuid: String! @sv, versionUuid: String! @sv): DeployableVersion!

     """
     Gets a channel version info from this channel name and version name 
     """
     channelVersionByName(orgId: String! @sv, channelName: String! @sv, versionName: String! @sv): DeployableVersion!
  }

  extend type Mutation {
     """
     Adds a channel
     """
     addChannel(orgId: String! @sv, name: String! @sv): AddChannelReply!
     
     """
     Edits a channel
     """
     editChannel(orgId: String! @sv, uuid: String! @sv, name: String! @sv): EditChannelReply!
     
     """
     Adds a yaml version to this channel
     Requires either content:String or file:Upload
     """
     addChannelVersion(orgId: String! @sv, channelUuid: String! @sv, name: String! @sv, type: String! @sv, content: String @sv, file: Upload, description: String @sv): AddChannelVersionReply!
     """
     Removes a channel
     """
     removeChannel(orgId: String! @sv, uuid: String! @sv): RemoveChannelReply!

     """
     Removes a channel version
     """
     removeChannelVersion(orgId: String! @sv, uuid: String! @sv): RemoveChannelVersionReply!
  }
`;

module.exports = channelSchema;
