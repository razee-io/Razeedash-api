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

const axios = require('axios');

const subscriptionsFunc = grahqlUrl => {
  const subscriptionsByCluster = async (token, variables, orgKey) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($cluster_id: String) {
            subscriptionsByCluster( cluster_id: $cluster_id) {
              subscription_name
              subscription_channel
              subscription_uuid
              subscription_version
              url
          }
        }
    `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'razee-org-key': orgKey
        },
      },
    );
  const subscriptionsByClusterId = async (token, variables, orgKey) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($clusterId: String!) {
            subscriptionsByClusterId(clusterId: $clusterId) {
              subscriptionName
              subscriptionChannel
              subscriptionUuid
              subscriptionVersion
              url
          }
        }
    `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'razee-org-key': orgKey
        },
      },
    );
  const subscriptions = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!) {
            subscriptions(orgId: $orgId) {
              uuid
              orgId
              name
              groups
              channelUuid
              channelName
              version
              versionUuid
              created
              updated
              owner {
                id
                name
              }
            }
          }
        `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

  const subscription = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $uuid: String! ) {
            subscription(orgId: $orgId uuid: $uuid ) {
              uuid
              orgId
              name
              groups
              channelUuid
              channelName
              version
              versionUuid
              created
              updated
              owner {
                id
                name
              }
          }
        }
      `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

  const subscriptionByName = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $name: String! ) {
            subscriptionByName(orgId: $orgId name: $name ) {
              uuid
              orgId
              name
              groups
              channelUuid
              channelName
              version
              versionUuid
              created
              updated
              owner {
                id
                name
              }
          }
        }
      `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );


  const addSubscription = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String!) {
            addSubscription(orgId: $orgId, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid){
			        uuid
            }
          }
        `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

  const editSubscription = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String!) {
            editSubscription(orgId: $orgId, uuid: $uuid, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid) {
              uuid
              success
            }
          }
        `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

  const setSubscription = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $versionUuid: String!) {
            setSubscription(orgId: $orgId, uuid: $uuid, versionUuid: $versionUuid) {
              uuid
              success
            }
          }
        `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

  
  const removeSubscriptions = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!) {
            removeSubscription(orgId: $orgId, uuid: $uuid) {
              uuid
              success
          }
        }
    `,
        variables,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

  return {
    subscriptionsByCluster, /* deprecated */
    subscriptionsByClusterId,
    subscriptions,
    subscription,
    subscriptionByName,
    addSubscription,
    editSubscription,
    setSubscription,
    removeSubscriptions
  };
};
    
module.exports = subscriptionsFunc;
