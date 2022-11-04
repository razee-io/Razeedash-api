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
              remote { remoteType, parameters { key, value } }
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
              versionObj {
                uuid
                name
                remote {
                  parameters {
                    key
                    value
                  }
                }
              }
              created
              updated
              owner {
                id
                name
              }
              identitySyncStatus {
                unknownCount
                syncedCount
                pendingCount
                failedCount
              }
              custom
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
              versionObj {
                uuid
                name
                remote {
                  parameters {
                    key
                    value
                  }
                }
              }
              created
              updated
              owner {
                id
                name
              }
              groupObjs {
                uuid
                clusters {
                  clusterId
                  syncedIdentities {
                    id
                    syncStatus
                  }
                }
              }
              custom
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
              custom
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

  const subscriptionsForCluster = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $clusterId: String! ) {
            subscriptionsForCluster(orgId: $orgId clusterId: $clusterId ) {
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
              custom
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

  const subscriptionsForClusterByName = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $clusterName: String! ) {
            subscriptionsForClusterByName(orgId: $orgId clusterName: $clusterName ) {
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
              custom
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
          mutation($orgId: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String, $version: VersionInput, $custom: JSON) {
            addSubscription(orgId: $orgId, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid, version: $version, custom: $custom){
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
          mutation($orgId: String!, $uuid: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String, $version: VersionInput, $custom: JSON) {
            editSubscription(orgId: $orgId, uuid: $uuid, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid, version: $version, custom: $custom) {
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


  const removeSubscription = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $deleteVersion: Boolean) {
            removeSubscription(orgId: $orgId, uuid: $uuid, deleteVersion: $deleteVersion) {
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
    subscriptionsByClusterId,
    subscriptions,
    subscription,
    subscriptionByName,
    subscriptionsForCluster,
    subscriptionsForClusterByName,
    addSubscription,
    editSubscription,
    setSubscription,
    removeSubscription
  };
};

module.exports = subscriptionsFunc;
