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
          query($org_id: String! $cluster_id: String!) {
            clusterByClusterID( org_id: $org_id cluster_id: $cluster_id) {
              _id
              org_id
              cluster_id
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
          query($org_id: String! $cluster_id: String!) {
            clusterDistributedByClusterID( org_id: $org_id cluster_id: $cluster_id) {
              _id
              org_id
              cluster_id
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
          query ($org_id: String!  $limit: Int, $startingAfter: String) {
            clustersByOrgID ( org_id: $org_id limit: $limit startingAfter: $startingAfter) {
              _id
              org_id
              cluster_id
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
          query ($org_id: String $limit: Int) {
            clustersDistributedByOrgID ( org_id: $org_id limit: $limit) {
              _id
              org_id
              cluster_id
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
          query($org_id: String! $filter: String $limit: Int) {
            clusterSearch( org_id: $org_id filter: $filter limit: $limit) {
              _id
              org_id
              cluster_id
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
          query($org_id: String! $filter: String $limit: Int) {
            clusterDistributedSearch( org_id: $org_id filter: $filter limit: $limit) {
              _id
              org_id
              cluster_id
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
          query($org_id: String!) {
            clusterCountByKubeVersion( org_id: $org_id)  {
              _id {
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
          query($org_id: String!) {
            clusterDistributedCountByKubeVersion( org_id: $org_id)  {
              _id {
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
          query($org_id: String! $limit: Int) {
            clusterZombies( org_id: $org_id limit: $limit) {
              _id
              org_id
              cluster_id
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
          query($org_id: String! $limit: Int) {
            clusterDistributedZombies( org_id: $org_id limit: $limit) {
              _id
              org_id
              cluster_id
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

  const deleteClusterByClusterID = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($org_id: String! $cluster_id: String!) {
            deleteClusterByClusterID( org_id: $org_id cluster_id: $cluster_id) {
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
          mutation($org_id: String!) {
            deleteClusters( org_id: $org_id ) {
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
    deleteClusterByClusterID,
    deleteClusters,
  };
};

module.exports = clusterFunc;
