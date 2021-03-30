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
const openpgp = require('openpgp');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');

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


const encryptStrUsingOrgEncKey = ({ str, org })=>{
  if(!org.enableResourceEncryption || (org.encKeys||[]).length < 1){
    return { data: str }; // lazy feature flag for now
  }
  // finds the first non-deleted key in org.encKeys
  var encKey = _.find(org.encKeys||[], (encKey)=>{
    return !encKey.deleted;
  });
  if(!encKey){
    throw new Error('no encKey found');
  }

  var encKeyId = encKey.id;
  console.log(33333, str, encKey, encKeyId)
  var data = tokenCrypt.encrypt(str, encKey.key);
  return { encKeyId, data };
};

const decryptStrUsingOrgEncKey = ({ data, encKeyId, org })=>{
  if(!data || !encKeyId || !org){
    throw new Error('needs { data, encKeyId, org } properties');
  }
  var encKey = _.find(org.encKeys||[], (e)=>{
    return (e.id == encKeyId);
  });
  if(!encKey){
    throw new Error('no matching encKey found');
  }
  return tokenCrypt.decrypt(data, encKey.key);
};

var genKey = ()=>{
  var bytes = 32;
  var randBuff = crypto.randomBytes(bytes);
  if(!randBuff[0]){
    randBuff[0] = _.random(1, 255);
  }
  if(!randBuff[bytes - 1]){
    randBuff[bytes - 1] = _.random(1, 255);
  }
  var key = randBuff.toString('base64');
  var id = uuid();
  var creationTime = Date.now();
  var deleted = false;
  return {
    id, key, creationTime, deleted,
  };
};

// setTimeout(async()=>{
//   var s = Date.now();
//   var encKey = genKey();
//   console.log(33333, Date.now()-s, encKey);
//   var org = {
//     enableResourceEncryption: true,
//     encKeys: [ encKey ],
//   };
//   var str = _.padStart('', 5000, 'B');
//   var encrypted = encryptStrUsingOrgEncKey({ str, org });
//   console.log(22222, Date.now()-s);
//   var decrypted = decryptStrUsingOrgEncKey({ ...encrypted, org });
//   console.log(22222, Date.now()-s);
//
//   var s = Date.now();
//   var str = _.padStart('', 100000, 'C');
//   console.log(44441, Date.now()-s)
//   var e = tokenCrypt.encrypt(str, encKey.key);
//   console.log(44442, Date.now()-s)
//   var d = tokenCrypt.decrypt(e, encKey.key);
//   console.log(44443, Date.now()-s)
// },1);


module.exports = { getOrg, verifyAdminOrgKey, encryptOrgData, decryptOrgData, encryptStrUsingOrgEncKey, decryptStrUsingOrgEncKey, genKey };
