/**
 * Copyright 2024 IBM Corp. All Rights Reserved.
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


/*
This sample shows how the startup/liveness/readiness probes can be customized by providing a
module that exports three functions:
- getStartupPayload
- getReadinessPayload
- getLivenessPayload

In each case, the function should return a payload string (not used by kubernetes, but can
be informative), or throw an error that explains why the probe should be failed.

In this sample:
- Return failure for startup probe for 60s, then success
- Return success for readiness probe for 5 minutes, then failure
- Always return success for liveness probe

To use this sample, `export PROBE_IMPL=./probe-sample` before starting the server.
*/

const START_TIME = Date.now();

async function getStartupPayload(req) {
  const method = 'getStartupPayload';
  req.log.warn( {req_id: req.id}, `${method} using SAMPLE implementation, should only happen during dev/test` );

  if( Date.Now() - START_TIME < 60*1000 ) {
    throw new Error('startup probe failing for first 60 seconds');
  }
  return('startup probe passing after 60 seconds');
}

async function getReadinessPayload(req) {
  const method = 'getReadinessPayload';
  req.log.warn( {req_id: req.id}, `${method} using SAMPLE implementation, should only happen during dev/test` );

  if( Date.Now() - START_TIME < 5*60*1000 ) {
    return('readiness probe passing for first 5 minutes');
  }
  throw new Error('readiness probe failing after 5 minutes');
}

async function getLivenessPayload(req) {
  const method = 'getLivenessPayload';
  req.log.warn( {req_id: req.id}, `${method} using SAMPLE implementation, should only happen during dev/test` );

  return('liveness probe passing');
}

module.exports = { getLivenessPayload, getReadinessPayload, getStartupPayload };
