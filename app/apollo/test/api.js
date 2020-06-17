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

const apiFunc = grahqlUrl => {
  const registrationUrl = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
        query ($org_id: String!) {
          registrationUrl(org_id: $org_id) {
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
            _id
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
              org_id
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
        mutation ($username: String! $email: String! $password: String! $org_name: String $role: String) {
          signUp(
            username: $username
            email: $email
            password: $password
            org_name: $org_name
            role: $role
          ) {
            token
          }
        }
      `,
      variables,
    });

  const signIn = async variables =>
    axios.post(grahqlUrl, {
      query: `
        mutation ($login: String! $password: String!) {
          signIn(
            login: $login
            password: $password
          ) {
            token
          }
        }
      `,
      variables,
    });

  /*
  const upsertResource = async variables =>
    axios.post(grahqlUrl, {
      query: `
        mutation ($r: JSON!) {
          upsertResource(resource: $r) {
            _id
            org_id
            cluster_id
            selfLink
            searchableData
            created
          }
        }
      `,
      variables,
    });
  */

  const resource = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query ($org_id: String!, $_id: String!) {
            resource(org_id: $org_id, _id: $_id) {
              _id
              org_id
              cluster_id
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
          query ($org_id: String!, $_id: String!, $histId: String) {
            resource(org_id: $org_id, _id: $_id, histId: $histId) {
              _id
              org_id
              cluster_id
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
          query ($org_id: String!, $cluster_id: String!, $resourceSelfLink: String!, $beforeDate: Date, $afterDate: Date, $limit: Int = 20) {
            resourceHistory(org_id: $org_id, cluster_id: $cluster_id, resourceSelfLink: $resourceSelfLink, beforeDate: $beforeDate, afterDate: $afterDate, limit: $limit) {
              count,
              items{
                _id
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
          query ($org_id: String! $cluster_id: String! $selfLink: String!){
            resourceByKeys(org_id: $org_id cluster_id: $cluster_id selfLink: $selfLink) {
              _id
              org_id
              cluster_id
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
          query ($org_id: String!){
            resourcesCount (org_id: $org_id)
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
          query ($org_id: String! $filter: String $fromDate: Date $toDate: Date, $sort: [SortObj!]){
            resources (org_id: $org_id filter: $filter fromDate: $fromDate toDate: $toDate, sort: $sort) {
              count
              resources{
                _id
                org_id
                cluster_id
                selfLink
                searchableData
                created
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

  const resourcesByCluster = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query ($org_id: String! $cluster_id: String! $filter: String){
            resourcesByCluster (org_id: $org_id cluster_id: $cluster_id filter: $filter) {
              count
              resources{
                _id
                org_id
                cluster_id
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
          query ($org_id: String! $subscription_id: String!){
            resourcesBySubscription(org_id: $org_id subscription_id: $subscription_id ) {
              count
              resources{
                _id
                org_id
                cluster_id
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
          query ($_id: ID!) {
            resourceDistributed(_id: $_id) {
              _id
              org_id
              cluster_id
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
          query ($org_id: String! $cluster_id: String! $selfLink: String!){
            resourceDistributedByKeys(org_id: $org_id cluster_id: $cluster_id selfLink: $selfLink) {
              _id
              org_id
              cluster_id
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
        query ($org_id: String!){
          resourcesDistributedCount (org_id: $org_id)
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
          query ($org_id: String! $filter: String $fromDate: Date $toDate: Date){
            resourcesDistributed (org_id: $org_id filter: $filter fromDate: $fromDate toDate: $toDate) {
              _id
              org_id
              cluster_id
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
          query ($org_id: String! $cluster_id: String! $filter: String){
            resourcesDistributedByCluster (org_id: $org_id cluster_id: $cluster_id filter: $filter) {
              _id
              org_id
              cluster_id
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
        mutation ($r: JSON!) {
          resourceChanged(resource: $r) {
            _id
            org_id
            cluster_id
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
