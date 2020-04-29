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
  const subscriptionsByTag = async (token, variables, orgKey) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($org_id: String!, $tags: String) {
            subscriptionsByTag( org_id: $org_id, tags: $tags) {
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
    subscriptionsByTag,
    removeSubscriptions
  };
};
    
module.exports = subscriptionsFunc;
