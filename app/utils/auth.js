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

// This is the default implementation rbacAuth call based on 
// actions and type of objects for a given api. This default impl
// does not implement any RBAC, it only logs the action and type 
// of object passed into this middleware and validate users api key.
// Auth provider should replace this middleware with their own impl.

const rbacAuth = (action, type) => async(req, res, next) => {
  const userId = req.get('x-user-id');
  const apiKey = req.get('x-api-key');
  
  req.log.trace({action, type, req_id: req.id}, 'requireAuth enter...');
    
  if (!userId || !apiKey) {
    res.status(401).send('x-user-id and x-api-key required');
    return;
  }
  
  const Users = req.db.collection('users');
  const user = await Users.findOne({ _id: userId, apiKey: apiKey });
  
  if (!user) {
    res.sendStatus(403);
    return;
  }
  next();
};
  
module.exports = { rbacAuth };