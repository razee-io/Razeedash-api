/**
* Copyright 2019, 2023 IBM Corp. All Rights Reserved.
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

const pino = require('pino');
const pinoHttp = require('pino-http');

const getPinoConfig = (route) => {
  const config = {
    name: route,
    level: 'info',
    redact: ['req.headers["razee-org-key"]','req.headers["authorization"]','req.headers["x-api-key"]','req.headers["org-admin-key"]'],
    timestamp: pino.stdTimeFunctions.isoTime,
    destination: pino.destination(1)  //stdout
  };
  return config;
};

const createExpressLogger = (route) => {
  // Note: Pino does not log body by default (see https://github.com/pinojs/pino-http?tab=readme-ov-file#logging-request-body).
  // If it is desired, care must be taken to ensure sensitive values are not exposed, nor logs stuffed with overlarge payloads.
  // See pino 'serializers' option, and previously used 'serializer' implementation in earlier commits of this file.
  return pinoHttp({
    logger: pino(getPinoConfig(route)),
    quietReqLogger: true,
    customAttributeKeys: {
      reqId: 'req_id'
    },
    customLogLevel: function (req, res, err) {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        return 'warn';
      } else if (res.statusCode >= 500 || err) {
        return 'error';
      }
      return 'silent';
    }
  });
};

const createLogger = (route, ids) => {
  const config = getPinoConfig(route);
  config.base = { ...config.base, ...ids };
  return pino(config);
};

const log = pino( getPinoConfig('razeedash-api-test') );  // logger for unit-tests

module.exports = { createLogger, createExpressLogger, log };
