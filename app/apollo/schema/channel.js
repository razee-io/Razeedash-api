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

/*
Note: `scalar Upload` implementation is provided by GraphQLUpload in app/apollo/index.js
*/

const channelSchema = gql`
  scalar Upload

  input ParameterInput {
    key: String!
    value: String!
  }
  input ChannelRemoteInput {
    remoteType: String
    parameters: [ParameterInput]
  }
  input VersionRemoteInput {
    parameters: [ParameterInput]
  }
  input VersionInput {
    name: String!
    description: String
    type: String!
    content: String
    file: Upload
    remote: VersionRemoteInput
  }
  input SubscriptionInput {
    name: String!
    versionName: String!
    groups: [String!]
    custom: JSON
  }
  type ParameterTuple {
    key: String!
    value: String!
  }
  type ChannelVersion {
    uuid: String!
    name: String!
    description: String
    created: Date
    location: String
  }
  type ChannelRemoteSource {
    remoteType: String!
    parameters: [ParameterTuple]
  }
  type VersionRemoteSource {
    parameters: [ParameterTuple]
  }
  type Channel {
    uuid: String!
    orgId: String!
    name: String!
    contentType: String
    remote: ChannelRemoteSource
    data_location: String
    created: Date!
    updated: Date!
    versions: [ChannelVersion]
    subscriptions: [ChannelSubscription]
    tags: [String!]!
    custom: JSON
    owner: BasicUser
    kubeOwnerName: String
  }
  type AddChannelReply {
    uuid: String!
  }
  type EditChannelReply {
    uuid: String!
    name: String!
    tags: [String!]!
    success: Boolean
  }
  type AddChannelVersionReply {
    versionUuid: String!
    success: Boolean!
  }
  type EditChannelVersionReply {
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
    orgId: String!
    uuid: String!
    channelId: String!
    channelName: String!
    name: String!
    type: String!
    description: String
    content: String
    remote: VersionRemoteSource
    owner: BasicUser
    kubeOwnerName: String
    created: Date!
    updated: Date!
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
     Gets channels that contain all passed tags
     """
     channelsByTags(orgId: String! @sv, tags: [String!]!): [Channel]!

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
     addChannel(orgId: String! @sv, name: String! @sv, contentType: String, remote: ChannelRemoteInput, data_location: String, tags: [String!], custom: JSON, versions: [VersionInput!], subscriptions: [SubscriptionInput!]): AddChannelReply!

     """
     Edits a channel
     """
     editChannel(orgId: String! @sv, uuid: String! @sv, name: String! @sv, remote: ChannelRemoteInput, data_location: String, tags: [String!], custom: JSON): EditChannelReply!

     """
     Adds a version to this channel
     Requires either content:String or file:Upload
     """
     addChannelVersion(orgId: String! @sv, channelUuid: String! @sv, name: String! @sv, description: String @sv, type: String! @sv, content: String @sv, file: Upload, remote: VersionRemoteInput, subscriptions: [SubscriptionInput!]): AddChannelVersionReply!

     """
     Edits a version
     """
     editChannelVersion(orgId: String! @sv, uuid: String! @sv, description: String @sv, remote: VersionRemoteInput ): EditChannelVersionReply!

     """
     Removes a channel
     """
     removeChannel(orgId: String! @sv, uuid: String! @sv): RemoveChannelReply!

     """
     Removes a channel version
     """
     removeChannelVersion(orgId: String! @sv, uuid: String! @sv, deleteSubscriptions: Boolean): RemoveChannelVersionReply!
  }
`;

module.exports = channelSchema;
