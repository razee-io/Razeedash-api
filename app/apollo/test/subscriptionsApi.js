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
  const subscriptions = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($org_id: String!) {
            subscriptions( org_id: $org_id) {
              uuid
              org_id
              name
              groups
              channel_uuid
              channel_name
              version
              version_uuid
              created
              updated
              owner {
                _id
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
          query($org_id: String!, $uuid: String! ) {
            subscription( org_id: $org_id uuid: $uuid ) {
              uuid
              org_id
              name
              groups
              channel_uuid
              channel_name
              version
              version_uuid
              created
              updated
              owner {
                _id
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
          mutation($org_id: String!, $name: String!, $groups: [String!]!, $channel_uuid: String!, $version_uuid: String!) {
            addSubscription(org_id: $org_id, name: $name, groups: $groups, channel_uuid: $channel_uuid, version_uuid: $version_uuid){
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
          mutation($org_id: String!, $uuid: String!, $name: String!, $groups: [String!]!, $channel_uuid: String!, $version_uuid: String!) {
            editSubscription( org_id: $org_id, uuid: $uuid, name: $name, groups: $groups, channel_uuid: $channel_uuid, version_uuid: $version_uuid) {
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
          mutation($org_id: String!, $uuid: String!, $version_uuid: String!) {
            setSubscription( org_id: $org_id, uuid: $uuid, version_uuid: $version_uuid) {
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
          mutation($org_id: String!, $uuid: String!) {
            removeSubscription( org_id: $org_id, uuid: $uuid) {
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
    subscriptionsByCluster,
    subscriptions,
    subscription,
    addSubscription,
    editSubscription,
    setSubscription,
    removeSubscriptions
  };
};
    
module.exports = subscriptionsFunc;
