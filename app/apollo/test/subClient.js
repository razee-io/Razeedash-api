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

const { SubscriptionClient } = require('subscriptions-transport-ws');
const ws = require('ws');
const gql = require('graphql-tag');

module.exports = class SubClient {
  constructor(options) {
    // let cache = new InMemoryCache();
    this._wsClient = new SubscriptionClient(
      options.wsUrl,
      {
        reconnect: true,
        connectionParams: {
          'authorization': options.token,
          'headers': {
            'razee-org-key': options.orgKey
          }
        },
      },
      ws,
    );
  }

  request(query, varibles) {
    console.log( `PLC subClient request entry` );
    const operation = {
      query: gql`${query}`,
      variables: varibles
    };
    return this._wsClient.request(operation);
  }

  close() {
    this._wsClient.close();
  }
};
