/**
* Copyright 2019 IBM Corp. All Rights Reserved.
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

const responseCodeMapper = (status, err, meta) => {
  if (meta['req-headers'] && meta['req-headers']['authorization']) {
    meta['req-headers']['authorization'] = 'Bearer [HIDDEN]';
    meta['req-headers']['x-auth-refresh-token'] = 'Bearer [HIDDEN]';
  }
  if (meta.method === 'OPTIONS' && status === 204) {
    // skip OPTION request 204 response
    return 'trace';
  } else if (meta.body && meta.body.operationName === 'IntrospectionQuery') {
    // skip playground introspection query
    return 'trace';
  } else if (status === 500) {
    return 'error';
  } else if (status === 400 || status === 404) {
    return 'warn';
  } else if (status === 200 || status === 201) {
    return 'debug';
  } else {
    return 'info';
  }
};

const getBunyanConfig = (route) => {
  const result = {
    name: route,
    parseUA: false,
    excludes: ['referer', 'short-body'],
    levelFn: responseCodeMapper,
    obfuscate: ['req.headers.razee-org-key', 'req.headers.x-api-key', 'req.body.variables.login', 'req.body.variables.password', 'req.body.variables.email', 'req.body.variables.name'],
    genReqId: function (req) {
      return req.request_id;
    },
    streams: [{
      level: process.env.LOG_LEVEL || 'info',
      stream: process.stdout
    }]
  };
  return result;
};

module.exports = { getBunyanConfig };
