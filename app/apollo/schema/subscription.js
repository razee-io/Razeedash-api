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
    _id: String!
    name: String!
  }
  type ChannelSubscription {
    uuid: String!
    org_id: String!
    name: String!
    tags: [String!]!
    channel_uuid: String!
    channel: String!
    version: String!
    version_uuid: String!
    owner: BasicUser!
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
  type AddChannelSubscriptionReply {
    uuid: String!
  }
  type UpdatedSubscription {
    subscription_uuid: String!,
    url: String!
  }
  type SubscriptionUpdated {
    subscriptions: [UpdatedSubscription!]!
  }
  
  extend type Query {
     """
     Gets all subscriptions for org_id
     """
     subscriptions(org_id: String!): [ChannelSubscription]
     """
     Get a single subscriptions
     """
     subscription(org_id: String!, uuid: String!): ChannelSubscription
  }
  extend type Mutation {
     """
     Adds a subscription
     """
     addSubscription(org_id: String!, name: String!, tags: [String!]!, channel_uuid: String!, version_uuid: String!): AddChannelSubscriptionReply!
     
     """
     Edits a subscription
     """
     editSubscription(org_id: String!, uuid: String!, name: String!, tags: [String!]!, channel_uuid: String!, version_uuid: String!): EditChannelSubscriptionReply!
     
     """
     Removes a subscription
     """
     removeSubscription(org_id: String!, uuid: String!): RemoveChannelSubscriptionReply
  }
  extend type Subscription {
    subscriptionUpdated(org_id: String!, tags: [String]): SubscriptionUpdated!
  }
`;

module.exports = subscriptionSchema;
