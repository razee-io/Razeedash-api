/**
* Copyright 2021 IBM Corp. All Rights Reserved.
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

const { RazeeMaintenanceMode } = require ('../resolvers/common');
const { maintenanceMode, maintenanceMessage } = require('../../utils/maintenance');
const conf = require('../../conf.js').conf;

const apolloMaintenancePlugin = {
  requestDidStart() {
    return {
      // https://www.apollographql.com/docs/apollo-server/integrations/plugins/#responseforoperation
      // The responseForOperation event is fired immediately before GraphQL execution would take place.
      // If its return value resolves to a non-null GraphQLResponse, that result is used instead of executing the query.
      async responseForOperation(context) {
        if(context.operation && context.operation.operation && context.operation.operation === 'mutation') {
          if(await maintenanceMode(conf.maintenance.flag, conf.maintenance.key)) {
            throw new RazeeMaintenanceMode(maintenanceMessage, context);
          }
        }
        return;
      }
    };
  }
};

module.exports = apolloMaintenancePlugin;
