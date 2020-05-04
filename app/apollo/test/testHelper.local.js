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

const { AUTH_MODELS, AUTH_MODEL } = require('../models/const');

// This file contains auth specific impl to help prepare
// org, users, and how to signin users
async function prepareOrganization(models, orgData) {
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    return await models.Organization.createLocalOrg(orgData);
  } 
  return null;
}

async function prepareUser (models, userData) {
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    return await models.User.createUser(models, userData);
  } 
  return null;
}

async function signInUser (models, api, userData) {
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {
    const result0 = await api.signIn({
      login: userData.email,
      password: userData.password
    });
    console.log(JSON.stringify(result0.data));
    return result0.data.data.signIn.token;
  } 
  return null;
}

async function signUpUser (models, api, userData) {
  if (AUTH_MODEL === AUTH_MODELS.LOCAL) {   
    const result0 = await api.signUp({
      username: userData.username,
      email: userData.email,
      password: userData.password,
      org_name: userData.orgName,
      role: userData.role,
    });
    return result0.data.data.signUp.token;
  }
  return null;
}

module.exports = { prepareOrganization, prepareUser, signInUser, signUpUser };
