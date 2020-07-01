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

const groupFunc = grahqlUrl => {
  const groups = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($org_id: String!) {
            groups( org_id: $org_id ) {
                uuid
                org_id
                name
                owner {
                  _id
                  name
                }
                created
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
  
  const group = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($org_id: String!, $uuid: String!) {
            group( org_id: $org_id, uuid: $uuid ) {
              uuid
              clusterCount
              subscriptionCount
              subscriptions
              clusters
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

  const groupByName = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($org_id: String!, $name: String!) {
            groupByName( org_id: $org_id, name: $name ) {
              uuid
              clusterCount
              subscriptionCount
              subscriptions
              clusters
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
    groups,
    group,
    groupByName
  };
};
        
module.exports = groupFunc;
