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

const subscriptionSchema = gql`
  type BasicUser {
    id: String!
    name: String!
  }
  type BasicChannelSubscription {
    uuid: String!
    orgId: String!
    name: String!
    groups: [String!]
    channelUuid: String!
    channelName: String!
    version: String!
    versionUuid: String!
    created: Date!
    updated: Date!
  }
  type ChannelSubscription {
    uuid: String!
    orgId: String!
    name: String!
    groups: [String!]
    channelUuid: String!
    channelName: String!
    channel: Channel
    version: String!
    versionUuid: String!
    owner: BasicUser!
    resources: [Resource!]
    created: Date!
    updated: Date!
  }
  type RemoveChannelSubscriptionReply {
    uuid: String!
    success: Boolean
  }
  type EditChannelSubscriptionReply {
    uuid: String!
    success: Boolean
  }
  type SetSubscriptionReply {
    uuid: String!
    success: Boolean
  }
  type AddChannelSubscriptionReply {
    uuid: String!
  }
  type UpdatedSubscriptionDeprecated {
    subscription_name: String!,
    subscription_channel: String!,
    subscription_version: String!,
    subscription_uuid: String!,
    url: String!
  }
  type UpdatedSubscription {
    subscriptionName: String!,
    subscriptionChannel: String!,
    subscriptionVersion: String!,
    subscriptionUuid: String!,
    url: String!
  }
  type SubscriptionUpdated {
    "**has_updates**: deprecated, use hasUpdates"
    has_updates: Boolean
    hasUpdates: Boolean
  }
  
  extend type Query {
     """
     Gets all subscriptions for orgId
     """
     subscriptions(orgId: String!): [ChannelSubscription]
     """
     Get a single subscription
     """
     subscription(orgId: String!, uuid: String!): ChannelSubscription
     """
     Get a single subscription by name
     """
     subscriptionByName(orgId: String!, name: String!): ChannelSubscription
     """
     Agent-facing API, deprecated. Gets all subscriptions for a cluster
     """
     subscriptionsByCluster(cluster_id: String): [UpdatedSubscriptionDeprecated]
     """
     Agent-facing API. Gets all subscriptions for a cluster.
     """
     subscriptionsByClusterId(clusterId: String!): [UpdatedSubscription]
     """
     Ge subscriptions by clusterId
     """
     subscriptionsForCluster(orgId: String!, clusterId: String!): [BasicChannelSubscription]
     """
     Ge subscriptions by clusterName
     """
     subscriptionsForClusterByName(orgId: String!, clusterName: String!): [BasicChannelSubscription]
  }
  extend type Mutation {
     """
     Adds a subscription
     """
     addSubscription(orgId: String!, name: String!, groups: [String!]!, channelUuid: String!, versionUuid: String!): AddChannelSubscriptionReply!
     
     """
     Edits a subscription
     """
     editSubscription(orgId: String!, uuid: String!, name: String!, groups: [String!]!, channelUuid: String!, versionUuid: String!): EditChannelSubscriptionReply!
     
     """
     Set a configurationVersion
     """
     setSubscription(orgId: String!, uuid: String!, versionUuid: String! ): SetSubscriptionReply!
     
     """
     Removes a subscription
     """
     removeSubscription(orgId: String!, uuid: String!): RemoveChannelSubscriptionReply
  }
  extend type Subscription {
    subscriptionUpdated: SubscriptionUpdated!
  }
`;

module.exports = subscriptionSchema;
