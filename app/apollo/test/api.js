/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
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

const apiFunc = grahqlUrl => {
  const registrationUrl = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
        query($orgId: String!) {
          registrationUrl(orgId: $orgId) {
            url
          }
        }
      `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const organizations = async token =>
    axios.post(
      grahqlUrl,
      {
        query: `
        query {
          organizations {
            id
            name
          }
        }
      `,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const me = async token =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query {
            me {
              id
              email
              orgId
              meta
            }
          }
        `,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const signUp = async variables =>
    axios.post(grahqlUrl, {
      query: `
        mutation($username: String! $email: String! $password: String! $orgName: String $role: String) {
          signUp(
            username: $username
            email: $email
            password: $password
            orgName: $orgName
            role: $role
          ) {
            token
          }
        }
      `,
      variables,
    });

  const signIn = async (variables, orgAdminKey) =>
    axios.post(grahqlUrl,
      {
        query: `
        mutation($login: String! $password: String!) {
          signIn(
            login: $login
            password: $password
          ) {
            token
          }
        }
      `,
        variables,
      },
      {
        headers: { 'org-admin-key': `${orgAdminKey}` },
      }
    );

  const resource = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $id: String!) {
            resource(orgId: $orgId, id: $id) {
              id
              orgId
              clusterId
              selfLink
              searchableData
              created
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourceHistId = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $id: String!, $histId: String) {
            resource(orgId: $orgId, id: $id, histId: $histId) {
              id
              orgId
              clusterId
              selfLink
              searchableData
              created
              data
              updated
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourceHistory = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $clusterId: String!, $resourceSelfLink: String!, $beforeDate: Date, $afterDate: Date, $limit: Int, $skip: Int) {
            resourceHistory(orgId: $orgId, clusterId: $clusterId, resourceSelfLink: $resourceSelfLink, beforeDate: $beforeDate, afterDate: $afterDate, limit: $limit, skip: $skip) {
              count,
              totalCount,
              items{
                id
                updated
              }
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );


  const resourceByKeys = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $clusterId: String! $selfLink: String!){
            resourceByKeys(orgId: $orgId clusterId: $clusterId selfLink: $selfLink) {
              id
              orgId
              clusterId
              selfLink
              searchableData
              created
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourcesCount = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!){
            resourcesCount(orgId: $orgId)
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resources = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $filter: String, $fromDate: Date, $toDate: Date, $kinds: [String!], $sort: [SortObj!], $limit: Int, $skip: Int){
            resources(orgId: $orgId, filter: $filter, fromDate: $fromDate, toDate: $toDate, kinds: $kinds, sort: $sort, limit: $limit, skip: $skip) {
              count,
              totalCount
              resources{
                id
                orgId
                clusterId
                selfLink
                searchableData
                created
                updated
                cluster{
                  clusterId
                  name
                }
                data
              }
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourcesByCluster = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $clusterId: String!, $filter: String, $limit: Int, $skip: Int){
            resourcesByCluster(orgId: $orgId, clusterId: $clusterId, filter: $filter, limit: $limit, skip: $skip) {
              count
              totalCount
              resources{
                id
                orgId
                clusterId
                selfLink
                searchableData
                created
              }
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourcesBySubscription = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $subscriptionId: String!, $limit: Int, $skip: Int){
            resourcesBySubscription(orgId: $orgId, subscriptionId: $subscriptionId, limit: $limit, skip: $skip) {
              count
              totalCount
              resources{
                id
                orgId
                clusterId
                selfLink
                searchableData
                created
              }
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourceDistributed = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($id: ID!) {
            resourceDistributed(id: $id) {
              id
              orgId
              clusterId
              selfLink
              searchableData
              created
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourceDistributedByKeys = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $clusterId: String! $selfLink: String!){
            resourceDistributedByKeys(orgId: $orgId clusterId: $clusterId selfLink: $selfLink) {
              id
              orgId
              clusterId
              selfLink
              searchableData
              created
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourcesDistributedCount = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
        query($orgId: String!){
          resourcesDistributedCount(orgId: $orgId)
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourcesDistributed = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $filter: String $fromDate: Date $toDate: Date){
            resourcesDistributed(orgId: $orgId filter: $filter fromDate: $fromDate toDate: $toDate) {
              id
              orgId
              clusterId
              selfLink
              searchableData
              created
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourcesDistributedByCluster = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $clusterId: String! $filter: String){
            resourcesDistributedByCluster(orgId: $orgId clusterId: $clusterId filter: $filter) {
              id
              orgId
              clusterId
              selfLink
              searchableData
              created
            }
          }
        `,
        variables,
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
      },
    );

  const resourceChanged = async variables =>
    axios.post(grahqlUrl, {
      query: `
        mutation($r: JSON!) {
          resourceChanged(resource: $r) {
            id
            orgId
            clusterId
            selfLink
            searchableData
            created
          }
        }
      `,
      variables,
    });

  return {
    registrationUrl,
    organizations,
    me,
    signUp,
    signIn,
    resource,
    resourceHistId,
    resourceHistory,
    resourceByKeys,
    resourceChanged,
    resourcesCount,
    resources,
    resourcesByCluster,
    resourcesBySubscription,
    resourceDistributed,
    resourceDistributedByKeys,
    resourcesDistributedCount,
    resourcesDistributed,
    resourcesDistributedByCluster,
  };
};

module.exports = apiFunc;
