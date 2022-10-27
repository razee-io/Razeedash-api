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

const channelFunc = grahqlUrl => {
  const channels = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String!) {
            channels(orgId: $orgId) {
              uuid
              orgId
              name
              data_location
              created
              versions {
                uuid
                name
                description
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

  const channel = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $uuid: String!) {
            channel(orgId: $orgId uuid: $uuid) {
              uuid
              orgId
              name
              data_location
              created
              versions {
                uuid
                name
                description
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

  const channelByName = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $name: String!) {
            channelByName(orgId: $orgId name: $name) {
              uuid
              orgId
              name
              data_location
              created
              versions {
                uuid
                name
                description
              }
              subscriptions {
                uuid
                name
                versionUuid
                version
                versionObj {
                  uuid
                  name
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

  const channelVersion = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $channelUuid: String!, $versionUuid: String!) {
            channelVersion(orgId: $orgId channelUuid: $channelUuid versionUuid: $versionUuid) {
              orgId
              uuid
              channelId
              channelName
              name
              type
              description
              content
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

  const channelVersionByName = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($orgId: String! $channelName: String!, $versionName: String!) {
            channelVersionByName(orgId: $orgId channelName: $channelName versionName: $versionName) {
              orgId
              uuid
              channelId
              channelName
              name
              type
              description
              content
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

  const addChannelVersion = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $channelUuid: String!, $name: String!, $type: String!, $content: String!, $description: String) {
            addChannelVersion(orgId: $orgId channelUuid: $channelUuid name: $name type: $type content: $content description: $description) {
              versionUuid
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

  const removeChannelVersion = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!) {
            removeChannelVersion(orgId: $orgId uuid: $uuid) {
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

  const addChannel = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!,$name: String!, $data_location: String, $custom: JSON) {
            addChannel(orgId: $orgId name: $name, data_location: $data_location, custom: $custom) {
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

  const editChannel = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!, $name: String! $custom: JSON) {
            editChannel(orgId: $orgId uuid: $uuid name: $name, custom: $custom) {
              uuid
              success
              name
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

  const removeChannel = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          mutation($orgId: String!, $uuid: String!) {
            removeChannel(orgId: $orgId uuid: $uuid) {
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
    channels,
    channel,
    channelByName,
    channelVersion,
    channelVersionByName,
    addChannelVersion,
    removeChannelVersion,
    addChannel,
    editChannel,
    removeChannel
  };
};

module.exports = channelFunc;
