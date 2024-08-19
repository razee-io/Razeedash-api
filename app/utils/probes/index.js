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
let PROBE_CUSTOM_IMPL = require( process.env.PROBE_IMPL || './probe-none.js' );

/*
Return an impl for each of the probe types:
  Get the default probe payload.
    If default probe impl throws an error, throw an error.
  If module specified by PROBE_IMPL implements a probe, get the custom probe payload.
    If custom probe impl throws an error, throw an error.
  Return the custom payload, or the default payload if there is none.
*/
const PROBE_IMPL = {
  getStartupPayload: async function( req ) {
    const method = 'getStartupPayload';
    const defaultPayload = await PROBE_DEFAULT_IMPL[method](req);
    if( Object.prototype.hasOwnProperty.call(PROBE_CUSTOM_IMPL, method) ) {
      return( await PROBE_CUSTOM_IMPL[method](req) );
    }
    return defaultPayload;
  },
  getReadinessPayload: async function( req ) {
    const method = 'getReadinessPayload';
    const defaultPayload = await PROBE_DEFAULT_IMPL[method](req);
    if( Object.prototype.hasOwnProperty.call(PROBE_CUSTOM_IMPL, method) ) {
      return( await PROBE_CUSTOM_IMPL[method](req) );
    }
    return defaultPayload;
  },
  getLivenessPayload: async function( req ) {
    const method = 'getLivenessPayload';
    const defaultPayload = await PROBE_DEFAULT_IMPL[method](req);
    if( Object.prototype.hasOwnProperty.call(PROBE_CUSTOM_IMPL, method) ) {
      return( await PROBE_CUSTOM_IMPL[method](req) );
    }
    return defaultPayload;
  },
  setImpl: function( newImpl ) {
    PROBE_CUSTOM_IMPL = require( newImpl || './probe-none.js' );
  }
};

module.exports = PROBE_IMPL;
