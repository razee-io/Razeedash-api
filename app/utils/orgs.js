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
  if(org._id != 'abc'){
    return { data: str }; // lazy feature flag for now
  }
  // finds the first non-deleted key in org.encKeys
  var key = _.find(org.encKeys||[], (encKey)=>{
    return !encKey.deleted;
  });
  if(!key){
    throw new Error(`no encKey found`);
  }
  var { pubKey, fingerprint } = key;
  var pubKeyPgp = (await openpgp.key.readArmored(pubKey)).keys;
  var encryptedObj = await openpgp.encrypt({
    message: openpgp.message.fromText(str),
    publicKeys: pubKeyPgp,
  });
  // encryptedObj now holds { data, fingerprint }
  return {
    fingerprint,
    ...encryptedObj,
  };
};
const decryptStrUsingOrgEncKey = async({ encryptedObj, org })=>{
  if(!encryptedObj.data || !encryptedObj.fingerprint){
    throw new Error(`encryptedObj needs { data, fingerprint } properties`);
  }
  var key = _.find(org.encKeys||[], (encKey)=>{
    console.log(encKey.fingerprint, encryptedObj.fingerprint)
    return (encKey.fingerprint == encryptedObj.fingerprint);
  });
  if(!key){
    throw new Error(`no matching encKey found`);
  }
  var { privKey } = key;
  var privKeyPgp = (await openpgp.key.readArmored(privKey)).keys;
  var decryptedObj = await openpgp.decrypt({
    message: await openpgp.message.readArmored(encryptedObj.data),
    privateKeys: privKeyPgp,
  });
  return decryptedObj.data;
};

const crypto = require("crypto");
var bluebird = require('bluebird');

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
var encrypt = (str, pubKey)=>{
  // var pub = crypto.createPublicKey(pubKey);
  var encryptedData = crypto.publicEncrypt(
    {
      key: pubKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    // We convert the data string to a buffer using `Buffer.from`
    Buffer.from(str)
  ).toString('base64');
  // console.log(3333, encryptedData)
  return encryptedData;
};

var decrypt = (encryptedStr, privKey)=>{
  var s = Date.now();
  // var priv = crypto.createPrivateKey(privKey);
  // console.log(5555, priv)
  const decryptedData = crypto.privateDecrypt(
    {
      key: privKey,
      // In order to decrypt the data, we need to specify the
      // same hashing function and padding scheme that we used to
      // encrypt the data in the previous step
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encryptedStr, 'base64')
  ).toString();
  return decryptedData;
};

setTimeout(async()=>{
  var { pubKey, privKey } = await genKeys();

  var s = Date.now();
  var results = await bluebird.all(bluebird.map(_.times(1), async()=>{
    var encryptedObj = await encrypt('asdf', pubKey);
    console.log(6666, encryptedObj)
    var decryptedObj = await decrypt(encryptedObj, privKey);
    console.log(33333, decryptedObj)
    return decryptedObj;
  }, {concurrency:10}));
  console.log(5555, results, Date.now()-s)
},1);

// setTimeout(async()=>{
//   var bluebird = require('bluebird');
//   try {
//     var str = 'asdf';
//     var org = {
//       encKeys: [{
//         "pubKey": "-----BEGIN PGP PUBLIC KEY BLOCK-----\r\nVersion: OpenPGP.js v4.10.10\r\nComment: https://openpgpjs.org\r\n\r\n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\r\n=B6K3\r\n-----END PGP PUBLIC KEY BLOCK-----\r\n",
//         "privKey": "-----BEGIN PGP PRIVATE KEY BLOCK-----\r\nVersion: OpenPGP.js v4.10.10\r\nComment: https://openpgpjs.org\r\n\r\n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\r\nzXUEQPg=\r\n=ilFS\r\n-----END PGP PRIVATE KEY BLOCK-----\r\n",
//         "fingerprint": "x6F1NuGJ+2iw+esHmM8xrFU0XA8=",
//         "creationTime": new Date("2021-02-23T15:32:46.821Z"),
//         "deleted": false
//       }],
//     };
//     var s = Date.now();
//     var results = await bluebird.all(bluebird.map(_.times(1), async()=>{
//       var encryptedObj = await encryptStrUsingOrgEncKey({ str, org });
//       console.log(3333, encryptedObj);
//       var result = await decryptStrUsingOrgEncKey({ encryptedObj, org });
//       console.log(4444, result);
//       return result;
//     },{concurrency:10}));
//     console.log(5555, results, Date.now()-s)
//   }
//   catch(err){
//     console.log('err',err);
//   }
// },5000)

module.exports = { getOrg, verifyAdminOrgKey, encryptOrgData, decryptOrgData, encryptStrUsingOrgEncKey, decryptStrUsingOrgEncKey };
