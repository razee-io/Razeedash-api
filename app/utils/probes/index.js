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

const PROBE_DEFAULT_IMPL = require( './probe-default.js' );
const PROBE_CUSTOM_IMPL = require( process.env.PROBE_IMPL || './probe-none.js' );

/*
Return an impl for each of the probe types:
  Get the default probe payload.
    If default probe impl throws an error, throw an error.
  If module specified by PROBE_IMPL implements a probe, get the custom probe payload.
    If custom probe impl throws an error, throw an error.
  Return the custom payload, or the default payload if there is none.
*/
const PROBE_IMPL = {
  getStartupPayload: async function( context ) {
    const method = 'getStartupPayload';
    const defaultPayload = await PROBE_DEFAULT_IMPL[method](context);
    if( !Object.prototype.hasOwnProperty.call(PROBE_CUSTOM_IMPL, method) ) {
      return( PROBE_DEFAULT_IMPL[method](context) );
    }
    return defaultPayload;
  },
  getReadinessPayload: async function( context ) {
    const method = 'getReadinessPayload';
    const defaultPayload = await PROBE_DEFAULT_IMPL[method](context);
    if( !Object.prototype.hasOwnProperty.call(PROBE_CUSTOM_IMPL, method) ) {
      return( PROBE_DEFAULT_IMPL[method](context) );
    }
    return defaultPayload;
  },
  getLivenessPayload: async function( context ) {
    const method = 'getLivenessPayload';
    const defaultPayload = await PROBE_DEFAULT_IMPL[method](context);
    if( !Object.prototype.hasOwnProperty.call(PROBE_CUSTOM_IMPL, method) ) {
      return( PROBE_DEFAULT_IMPL[method](context) );
    }
    return defaultPayload;
  }
};

module.exports = PROBE_IMPL;
