/**
 * Copyright 2022 IBM Corp. All Rights Reserved.
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

const orgKeyFunc = grahqlUrl => {
  const orgKey = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!, $uuid: String, $name: String) {
            orgKey(orgId: $orgId, uuid: $uuid, name: $name){
              uuid name primary created updated key
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

  const orgKeys = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!) {
            orgKeys(orgId: $orgId){
              uuid name primary created updated key
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

  const addOrgKey = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $name: String!, $primary: Boolean!) {
            addOrgKey(orgId: $orgId, name: $name, primary: $primary){
			        uuid key
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

  const removeOrgKey = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $forceDeletion: Boolean) {
            removeOrgKey(orgId: $orgId, uuid: $uuid, forceDeletion: $forceDeletion){
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

  const editOrgKey = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $name: String, $primary: Boolean) {
            editOrgKey(orgId: $orgId, uuid: $uuid, name: $name, primary: $primary){
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
    orgKey,
    orgKeys,
    addOrgKey,
    removeOrgKey,
    editOrgKey
  };
};

module.exports = orgKeyFunc;
