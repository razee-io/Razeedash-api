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
// const openpgp = require('openpgp');
const crypto = require('crypto');

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
  var key = _.find(org.encKeys||[], (encKey)=>{
    return !encKey.deleted;
  });
  if(!key){
    throw new Error('no encKey found');
  }
  var { pubKey, fingerprint } = key;
  var data = rsaEncrypt(str, pubKey);
  return { fingerprint, data };
};

const decryptStrUsingOrgEncKey = ({ data, fingerprint, org })=>{
  if(!data || !fingerprint || !org){
    throw new Error('needs { data, fingerprint, org } properties');
  }
  var key = _.find(org.encKeys||[], (encKey)=>{
    return (encKey.fingerprint == fingerprint);
  });
  if(!key){
    throw new Error('no matching encKey found');
  }
  return rsaDecrypt(data, key.privKey);
};

var genKeys = ()=>{
  const keys = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
  });
  var pubKey = keys.publicKey.export({ type:'pkcs1', format:'pem' });
  var privKey = keys.privateKey.export({ type:'pkcs1', format:'pem' });
  var fingerprint = crypto.createHash('sha256').update(pubKey).digest('base64');
  return {
    pubKey, privKey, fingerprint,
  };
};

var rsaEncrypt = (str, pubKey)=>{
  var encryptedStr = crypto.publicEncrypt(
    {
      key: pubKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(str)
  ).toString('base64');
  return encryptedStr;
};

var rsaDecrypt = (encryptedStr, privKey)=>{
  const decryptedStr = crypto.privateDecrypt(
    {
      key: privKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encryptedStr, 'base64')
  ).toString();
  return decryptedStr;
};

module.exports = { getOrg, verifyAdminOrgKey, encryptOrgData, decryptOrgData, encryptStrUsingOrgEncKey, decryptStrUsingOrgEncKey, genKeys };
