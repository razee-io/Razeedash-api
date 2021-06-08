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

const serviceSchema = gql`

  type ServiceSubscription {
    ssid: String!
    orgId: String!
    name: String!
    clusterId: String!
    channelUuid: String!
    channelName: String!
    channel: Channel
    version: String!
    versionUuid: String!
    owner: BasicUser
    kubeOwnerName: String
    resources: [Resource!]
    created: Date!
    updated: Date!
    remoteResources: [Resource!]
    rolloutStatus: RolloutStatus
  }

  enum SubscriptionType {
    USER
    SERVICE
  }

  union SubscriptionUnion = ChannelSubscription | ServiceSubscription

extend type Query {
    """
    Returns type of the subscription
    """
    subscriptionType(orgId: String! @sv, id: ID! @sv): SubscriptionType!

    """
    Gets all service subscriptions for user orgId
    """
    serviceSubscriptions(orgId: String! @sv): [ServiceSubscription]

    """
    Get a single service subscription
    """
    serviceSubscription(orgId: String! @sv, ssid: String! @sv): ServiceSubscription

    """
    Get both subscriptions and serviceSubscriptions
    """
    allSubscriptions(orgId: String! @sv): [SubscriptionUnion]
}

extend type Mutation {
    """
    Adds a service subscription and returns new service subscription unique id: 
        orgId - user org id
        name - service subscription name
        clusterId - target service cluster_id from different orgId
        channelUuid - user config uuid
        versionUuid - user config version uuid
    """
    addServiceSubscription(orgId: String! @sv, name: String! @sv, clusterId: String! @sv, channelUuid: String! @sv, versionUuid: String! @sv): ID
    
    """
    Edits a service subscription
        orgId - user org id
        ssid - unique service subscription id
        name - service subscription name
        channelUuid - user config uuid
        versionUuid - user config version uuid
    """
    editServiceSubscription(orgId: String! @sv, ssid: String! @sv, name: String! @sv, channelUuid: String! @sv, versionUuid: String! @sv): ID
    
    """
    Removes a service subscription
        orgId - user org id
        ssid - service subscription id
    """
    removeServiceSubscription(orgId: String! @sv, ssid: ID! @sv): ID
 }
`;

module.exports = serviceSchema;
