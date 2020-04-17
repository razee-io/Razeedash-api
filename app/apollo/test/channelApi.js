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
          query($org_id: String!) {
            channels( org_id: $org_id) {
              uuid
              org_id
              name
              created
              versions {
                uuid
                name
                description
                location
              }
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
          query($org_id: String! $uuid: String! ) {
            channel( org_id: $org_id uuid: $uuid ) {
              uuid
              org_id
              name
              created
              versions {
                uuid
                name
                description
                location
              }
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

  const getChannelVersion = async (token, variables) =>
    axios.post(
      grahqlUrl,
      {
        query: `
          query($org_id: String! $channel_uuid: String!, $version_uuid: String! ) {
            getChannelVersion( org_id: $org_id channel_uuid: $channel_uuid version_uuid: $version_uuid) {
              org_id
              uuid
              channel_id
              channel_name
              name
              type
              description
              content
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
          mutation($org_id: String!, $channel_uuid: String!, $name: String!, $type: String!, $content: String!, $description: String) {
            addChannelVersion( org_id: $org_id channel_uuid: $channel_uuid name: $name type: $type content: $content description: $description ) {
              version_uuid
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
          mutation($org_id: String!,$name: String!) {
            addChannel( org_id: $org_id name: $name) {
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
          mutation($org_id: String!, $uuid: String!, $name: String!) {
            editChannel( org_id: $org_id uuid: $uuid name: $name) {
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
          mutation($org_id: String!, $uuid: String!) {
            removeChannel( org_id: $org_id uuid: $uuid) {
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
    getChannelVersion,
    addChannelVersion,
    addChannel,
    editChannel,
    removeChannel
  };
};
    
module.exports = channelFunc;


