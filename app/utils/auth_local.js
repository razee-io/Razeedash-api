
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

const { models } = require('../apollo/models');
const { TYPES } = require('./auth.consts');

const whoIs = me => { 
  if (me === null || me === undefined) return 'null';
  if (me.email) return me.email;
  if (me.identifier) return me.identifier;
  return me._id;
};

module.exports = class LocalAuth {

  constructor() {
    this._name = 'Local RBAC';
  }
      
  rbac(action, type) {
    return async(req, res, next) => {
      const req_id = req.id;
      req.log.debug({name: this._name, action, type, req_id}, 'rbac enter...');
    
      const me = await models.User.getMeFromRequest(req);
    
      if (!me) {
        res.status(403).send('could not locate the user.');
        return;
      }
    
      const org_id = req.org._id;
      var attributes = null;
    
      if (type === TYPES.CHANNEL && req.params.channelName) {
        attributes = {channelName: req.params.channelName};
      } 
      if (type === TYPES.SUBSCRIPTION && req.params.id) {
        attributes = {subscriptionId: req.params.id};
      } 
    
      if (!(await models.User.isAuthorized(me, org_id, action, type, attributes, req_id))) {
        req.log.debug({name: this._name, req_id, me: whoIs(me), org_id, action, type, attributes}, 'rbacAuth permission denied - 401');
        res.status(401).send('Permission denied.');
      }
    
      req.log.debug({name: this._name, action, type, req_id, attributes}, 'rbacAuth permission granted - 200');
    
      next();
    };
  }
};