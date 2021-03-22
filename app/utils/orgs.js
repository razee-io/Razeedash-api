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


const encryptStrUsingOrgEncKey = async({ str, org })=>{
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
  var data = await gpgEncrypt(str, pubKey);
  console.log(333333, key, fingerprint, data)
  return { fingerprint, data };
};

const decryptStrUsingOrgEncKey = async({ data, fingerprint, org })=>{
  if(!data || !fingerprint || !org){
    throw new Error('needs { data, fingerprint, org } properties');
  }
  var key = _.find(org.encKeys||[], (encKey)=>{
    return (encKey.fingerprint == fingerprint);
  });
  if(!key){
    throw new Error('no matching encKey found');
  }
  return await gpgDecrypt(data, key.privKey);
};

var genKeys = async({ keyUserName })=>{
  const result = await openpgp.generateKey({
    rsaBits: 4096,
    userIds: [ { name: keyUserName } ],
  });
  const pubKey = result.publicKeyArmored;
  const privKey = result.privateKeyArmored;
  const fingerprint = Buffer.from(result.key.keyPacket.getFingerprintBytes()).toString('base64');
  return {
    pubKey, privKey, fingerprint,
  };
};

var gpgEncrypt = async(str, pubKey)=>{
  var pubKeyPgp = await openpgp.readKey({ armoredKey: pubKey });
  var encryptedStr = await openpgp.encrypt({
    message: openpgp.Message.fromText(str),
    publicKeys: pubKeyPgp,
  });
  return encryptedStr;
};

var gpgDecrypt = async(encryptedStr, privKey)=>{
  var privKeyPgp = await openpgp.readKey({ armoredKey: privKey });
  var message = await openpgp.readMessage({
    armoredMessage: encryptedStr,
  });
  var decryptedObj = await openpgp.decrypt({
    message,
    privateKeys: privKeyPgp,
  });
  return decryptedObj.data;
};


setTimeout(async()=>{
  var bluebird = require('bluebird');

  console.log(1111, await genKeys({ keyUserName: 'asdf@asdf.com' }));

  var org = {
    enableResourceEncryption: true,
    encKeys: [
      await genKeys({keyUserName:'rmgraham@us.ibm.com'}),
    ],
  };


  var s = Date.now();
  var results = await bluebird.all(bluebird.map(_.times(1), async()=>{
    var str = 'asdf';
    var encryptedObj = await encryptStrUsingOrgEncKey({ str, org });
    console.log(6666, encryptedObj)
    var decryptedObj = await decryptStrUsingOrgEncKey({ ...encryptedObj, org });
    console.log(33333, decryptedObj)
    return decryptedObj;
  }, {concurrency:10}));
  console.log(5555, results, Date.now()-s)
},1);

module.exports = { getOrg, verifyAdminOrgKey, encryptOrgData, decryptOrgData, encryptStrUsingOrgEncKey, decryptStrUsingOrgEncKey, genKeys };
