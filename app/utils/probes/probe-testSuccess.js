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
This sample shows how the startup/liveness/readiness probes can be customized to always succeed.
It is used by automated unit testing.
*/

async function getStartupPayload(req) {
  return('probe success for testing');
}

async function getReadinessPayload(req) {
  return('probe success for testing');
}

async function getLivenessPayload(req) {
  return('probe success for testing');
}

module.exports = { getLivenessPayload, getReadinessPayload, getStartupPayload };
