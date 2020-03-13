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

 // This module defines common verbs and types of objects for both 
 // graphql API and REST API. APIs use these actions and types to 
 // describe themselves. Such as an API is about `read` `resource`s, or
 // an API is about `manage` a `channel`, etc. 

 // We avoid to define specific RBAC roles required for APIs here.
 // This is because providers would have more flexibility to decide 
 // which role is required for a given API call.

 // Each Authorization provider translates these actions and types to 
 // its own RBAC API calls to validate users permission on a given API.
 
 // The default Auth provider rbac.js just logs the action and type of 
 // the object and validate user api key without actually invoke any
 // backend RBAC API. It totally depends on each Authorization providers 
 // to define their own RBAC policies and logic.

 const ACTIONS = {
    GET: 'get', 
    READ: 'read',
    WRITE: 'write',
    MANAGE: 'manage',
    SUBSCRIBE: 'subscribe',
  };
    
  const TYPES = {
    RESOURCE: 'resource',
    CLUSTER: 'cluster',
    MESSAGE: 'message',
    CHANNEL: 'channel',
    SUBSCRIPTION: 'subscription',
  };
  
  module.exports = { ACTIONS, TYPES };