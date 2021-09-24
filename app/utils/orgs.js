/**
* Copyright 2019 IBM Corp. All Rights Reserved.
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

const _ = require('lodash');
const tokenCrypt = require('./crypt.js');
const { models } = require('../apollo/models');
const { genKmsKey, rotateKey } = require('./keyProtect');

const getOrg = async(req, res, next) => {
  const orgKey = req.orgKey;
  if (!orgKey) {
    req.log.info( 'Missing razee-org-key' );
    res.status(401).send( 'razee-org-key required' );
    return;
  }

  const Orgs = req.db.collection('orgs');
  const org = await Orgs.findOne({ orgKeys: orgKey });
  if (!org) {
    res.status(403).send( `orgKey ${orgKey} not found` );
    return;
  }
  req.org = org; // eslint-disable-line require-atomic-updates
  next();
};


const verifyAdminOrgKey = async(req, res, next) => {
  const receivedAdminKey = req.get('org-admin-key');
  if(!receivedAdminKey) {
    req.log.warn(`org-admin-key not specified on route ${req.url}`);
    return res.status(400).send( 'org-admin-key required' );
  }

  const storedAdminKey = process.env.ORG_ADMIN_KEY;
  if(!storedAdminKey) {
    req.log.warn('ORG_ADMIN_KEY env variable was not found');
    return res.status(400).send( 'missing ORG_ADMIN_KEY environment variable' );
  }

  if(receivedAdminKey !== storedAdminKey) {
    req.log.warn(`invalid org-admin-key supplied on route ${req.url}`);
    return res.status(401).send( 'invalid org-admin-key' );
  }
  next();
};


const encryptOrgData = (orgKey, data) => {
  if (!_.isString(data)) {
    data = JSON.stringify(data);
  }
  return tokenCrypt.encrypt(data, orgKey);
};

const decryptOrgData = (orgKey, data) => {
  return tokenCrypt.decrypt(data, orgKey);
};

const getKmsKeyForOrg = async({ org, locationConfig })=>{
  if(!org || !org._id){
    throw new Error('genKmsKeyForOrg requires an org as input');
  }
  if(!locationConfig){
    throw new Error('genKmsKeyForOrg requires locationConfig in input');
  }
  let crn = _.get(org, 'kms.crn');
  if(crn){
    // if already has a key, then returns it
    return crn;
  }
  const name = `s3_org_encryption_key_${org._id}`;
  crn = await genKmsKey({ name, locationConfig });
  const search = {
    _id: org._id,
  };
  const updates = {
    $set: {
      'kms.crn': crn,
    }
  };
  await models.Organization.updateOne(search, updates);
  return crn;
};

const rotateKmsKeyForOrg = async({ org, locationConfig })=>{
  if(!org || !org._id){
    throw new Error('pass an org to rotateKmsKeyForOrg()');
  }
  if(!locationConfig){
    throw new Error('rotateKmsKeyForOrg requires locationConfig in input');
  }
  const crn = org.kms.crn;
  if(!crn){
    throw new Error('org doesnt have a kms crn');
  }
  await rotateKey({ crn, locationConfig });
  const sets = {
    'kms.lastRotateTime': new Date(),
  };
  await models.Organization.updateOne({ _id: org._id }, { $set: sets });
  return true;
};

// setTimeout(async()=>{
//   var org = await models.Organization.findOne({ _id: 'k4TTY77XNPMGjppfW' });
//   var result = await rotateKmsKeyForOrg({ org });
//   console.log(77777, org, result)
// },1)

module.exports = { getOrg, verifyAdminOrgKey, encryptOrgData, decryptOrgData, getKmsKeyForOrg, rotateKmsKeyForOrg };
