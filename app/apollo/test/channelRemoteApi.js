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

const channelRemoteFunc = grahqlUrl => {
  const addRemoteChannel = async (token, variables) => axios.post(
    grahqlUrl,
    {
      query: `
        mutation( $orgId: String!, $name: String!, $contentType: String, $remote: ChannelRemoteInput ) {
          addChannel(orgId: $orgId name: $name, contentType: $contentType, remote: $remote) {
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

  const getRemoteChannelByUuid = async (token, variables) => axios.post(
    grahqlUrl,
    {
      query: `
        query($orgId: String! $uuid: String!) {
          channel(orgId: $orgId uuid: $uuid) {
            orgId
            uuid
            name
            contentType
            remote {
              remoteType
              parameters {
                key
                value
              }
            }
            versions {
              uuid
              name
              description
            }
            custom
            created
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

  const editRemoteChannel = async (token, variables) => axios.post(
    grahqlUrl,
    {
      query: `
        mutation( $orgId: String!, $uuid: String!, $name: String!, $remote: ChannelRemoteInput ) {
          editChannel(orgId: $orgId, uuid: $uuid, name: $name, remote: $remote) {
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

  const addRemoteChannelVersion = async (token, variables) => axios.post(
    grahqlUrl,
    {
      query: `
        mutation($orgId: String!, $channelUuid: String!, $name: String!, $type: String!, $description: String, $remote: VersionRemoteInput) {
          addChannelVersion(orgId: $orgId, channelUuid: $channelUuid, name: $name, type: $type, description: $description, remote: $remote) {
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

  const getRemoteChannelVersionByUuid = async (token, variables) => axios.post(
    grahqlUrl,
    {
      query: `
      query($orgId: String!, $channelUuid: String!, $versionUuid: String!) {
        channelVersion(orgId: $orgId, channelUuid: $channelUuid, versionUuid: $versionUuid) {
          orgId
          uuid
          channelId
          channelName
          name
          type
          description
          remote { parameters { key, value } }
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

  const editRemoteChannelVersion = async (token, variables) => axios.post(
    grahqlUrl,
    {
      query: `
        mutation( $orgId: String!, $uuid: String!, $name: String!, $description: String!, $remote: VersionRemoteInput ) {
          editChannelVersion(orgId: $orgId, uuid: $uuid, name: $name, description: $description, remote: $remote) {
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
    addRemoteChannel,
    getRemoteChannelByUuid,
    editRemoteChannel,
    addRemoteChannelVersion,
    getRemoteChannelVersionByUuid,
    editRemoteChannelVersion,
  };
};

module.exports = channelRemoteFunc;
