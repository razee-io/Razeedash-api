/**
 * Copyright 2020, 2021 IBM Corp. All Rights Reserved.
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
Custom schemas can be specified by environment variable.
This allows, for example, replacing the built in 'user' schema with a custom one that does not provide `Mutation.signUp` or `Mutation.signIn`.
*/

const schemaMap = {
  'link': './link',
  'user': './user',
  'resource': './resource',
  'group': './group',
  'cluster': './cluster',
  'channel': './channel',
  'subscription': './subscription',
  'serviceSubscription': './serviceSubscription',
  'organization': './organization'
};
if( process.env.CUSTOM_RESOLVERS ) {
  const customSchemas = JSON.parse( process.env.CUSTOM_SCHEMAS );
  for( const key in customSchemas ) {
    schemaMap[key] = customSchemas[key];
  }
}
const schemas = [];
for( const key in schemaMap ) {
  console.log( `Loading schema '${key}' from '${schemaMap[key]}'`);
  schemas.push( require(schemaMap[key]) );
}

module.exports = schemas;
