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

 extend type Query {
 }
 extend type Mutation {
    """
    Adds a service subscription and returns new subscription uuid: 
        orgId - user orgId
        name - service subscription name
        clusterId - target service cluster_id from different orgId
        channelUuid - user config uuid
        versionUuid - user config version uuid
    """
    addServiceSubscription(orgId: String! @sv, name: String! @sv, clusterId: String! @sv, channelUuid: String! @sv, versionUuid: String! @sv): AddChannelSubscriptionReply!
    
    """
    Edits a service subscription
        uuid - subscription uuid (returned back in the response)
        name - service subscription name
        clusterId - target service cluster_id from different orgId
        channelUuid - user config uuid
        versionUuid - user config version uuid
    """
    editServiceSubscription(uuid: String! @sv, name: String! @sv, clusterId: String  @sv, channelUuid: String! @sv, versionUuid: String! @sv): EditChannelSubscriptionReply!
    
    """
    Set a configurationVersion
        uuid - subscription uuid (returned back in the response)
        versionUuid - user config version uuid
    """
    setServiceSubscription(uuid: String! @sv, versionUuid: String! @sv ): SetSubscriptionReply!
    
    """
    Removes a service subscription
        uuid - subscription uuid (returned back in the response)
    """
    removeServiceSubscription(uuid: String! @sv): RemoveChannelSubscriptionReply
 }
`;

 module.exports = serviceSchema;