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

 // If external auth model specified, use it.  Else use built-in auth model.
const { AUTH_MODEL, AUTH_MODEL_CLASS } = require('./auth.consts');
const externalAuthModels = require('../externalAuth.js').ExternalAuthModels;
const AuthClass = externalAuthModels[AUTH_MODEL] ? require(externalAuthModels[AUTH_MODEL].classPath) : require(`${AUTH_MODEL_CLASS}`);
const auth = new AuthClass();

module.exports = { auth };
