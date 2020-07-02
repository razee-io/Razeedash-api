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

const clusterFunc = grahqlUrl => {
  const byClusterID = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $clusterId: String!) {
            clusterByClusterId(orgId: $orgId clusterId: $clusterId) {
              id
              orgId
              clusterId
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

  const byClusterIDDistributed = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $clusterId: String!) {
            clusterDistributedByClusterId(orgId: $orgId clusterId: $clusterId) {
              id
              orgId
              clusterId
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

  const byOrgID = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!  $limit: Int, $startingAfter: String) {
            clustersByOrgId(orgId: $orgId limit: $limit startingAfter: $startingAfter) {
              id
              orgId
              clusterId
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

  const byOrgIDDistributed = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String $limit: Int) {
            clustersDistributedByOrgId(orgId: $orgId limit: $limit) {
              id
              orgId
              clusterId
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

  const search = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $filter: String $limit: Int) {
            clusterSearch(orgId: $orgId filter: $filter limit: $limit) {
              id
              orgId
              clusterId
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

  const searchDistributed = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $filter: String $limit: Int) {
            clusterDistributedSearch(orgId: $orgId filter: $filter limit: $limit) {
              id
              orgId
              clusterId
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

  const kubeVersionCount = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!) {
            clusterCountByKubeVersion(orgId: $orgId)  {
              id {
                major
                minor
              }
              count
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

  const kubeVersionCountDistributed = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!) {
            clusterDistributedCountByKubeVersion(orgId: $orgId)  {
              id {
                major
                minor
              }
              count
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

  const zombies = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $limit: Int) {
            clusterZombies(orgId: $orgId limit: $limit) {
              id
              orgId
              clusterId
              updated
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

  const zombiesDistributed = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $limit: Int) {
            clusterDistributedZombies(orgId: $orgId limit: $limit) {
              id
              orgId
              clusterId
              updated
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

  const deleteClusterByClusterId = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String! $clusterId: String!) {
            deleteClusterByClusterId(orgId: $orgId clusterId: $clusterId) {
              deletedClusterCount
              deletedResourceCount
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

  const deleteClusters = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!) {
            deleteClusters(orgId: $orgId) {
              deletedClusterCount
              deletedResourceCount
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
  const registerCluster = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!,$registration: JSON!) {
            registerCluster(orgId: $orgId registration: $registration) {
              url
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
    byClusterID,
    byClusterIDDistributed,
    byOrgID,
    byOrgIDDistributed,
    search,
    searchDistributed,
    kubeVersionCount,
    kubeVersionCountDistributed,
    zombies,
    zombiesDistributed,
    deleteClusterByClusterId,
    deleteClusters,
    registerCluster,
  };
};

module.exports = clusterFunc;
