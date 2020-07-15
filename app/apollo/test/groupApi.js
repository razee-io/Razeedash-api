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
          query($orgId: String!) {
            groups(orgId: $orgId ) {
                uuid
                orgId
                name
                owner {
                  id
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
          query($orgId: String!, $uuid: String!) {
            group( orgId: $orgId, uuid: $uuid ) {
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
          query($orgId: String!, $name: String!) {
            groupByName( orgId: $orgId, name: $name ) {
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
  
  const addGroup = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $name: String!) {
            addGroup(orgId: $orgId, name: $name){
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
  
  const removeGroup = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!) {
            removeGroup(orgId: $orgId, uuid: $uuid){
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
  
  const removeGroupByName = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $name: String!) {
            removeGroupByName(orgId: $orgId, name: $name){
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

  const groupClusters = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $clusters: [String]!) {
            groupClusters(orgId: $orgId, uuid: $uuid, clusters: $clusters){
			        modified
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

  const unGroupClusters = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $clusters: [String]!) {
            unGroupClusters(orgId: $orgId, uuid: $uuid, clusters: $clusters){
			        modified
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
    groupByName,
    addGroup,
    removeGroup,
    removeGroupByName,
    groupClusters,
    unGroupClusters
  };
};
        
module.exports = groupFunc;
