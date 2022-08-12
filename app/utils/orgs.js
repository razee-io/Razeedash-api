/**
* Copyright 2019, 2022 IBM Corp. All Rights Reserved.
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

const getOrgForOrgKey = async(models, orgKey) => {
  console.log( `PLC orgKey: ${orgKey}` );
  const org = await models.Organization.findOne( {
    $or: [ { orgKeys: orgKey }, { 'orgKeys2.key': orgKey } ]
  } ).lean( { virtuals: true } );
  console.log( `PLC org: ${JSON.stringify(org,null,2)}` );
  return org;
};

const getOrg = async(req, res, next) => {
  const orgKey = req.orgKey;
  if (!orgKey) {
    req.log.info( 'Missing razee-org-key' );
    res.status(401).json('{"msg": "razee-org-key required"}');
    return;
  }

  const Orgs = req.db.collection('orgs');
  const org = await Orgs.findOne( { $or: [ { 'orgKeys2.key': orgKey }, { orgKeys: orgKey } ] } );
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
    return res.status(400).json('{"msg": "org-admin-key required"}');
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

/*
Best OrgKey value is:
- First found OrgKeys2 key marked as Primary
- First found OrgKeys2 key if no Primary identified
- First OrgKeys if no OrgKeys2 exist
*/
const bestOrgKey = (org) => {
  if( org.orgKeys2 && org.orgKeys2.length > 0 ) {
    const bestOrgKey = org.orgKeys2.find( o => {
      return( o.primary );
    } );
    return( bestOrgKey || org.orgKeys2[0] );
  }
  else if( org.orgKeys && org.orgKeys.length > 0 ) {
    return( getLegacyOrgKeyObject( org.orgKeys[0] ) );
  }

  throw new Error( `No valid OrgKey found for organization ${org._id}` );
};
const getLegacyOrgKeyObject = (legacyOrgKey) => {
  return( {
    orgKeyUuid: legacyOrgKey,
    name: legacyOrgKey.slice( legacyOrgKey.length - 12 ),  // last segment of legacy key, which is essentially a UUID prefixed by `orgApiKey-`
    primary: false,
    created: null,
    updated: null,
    key: legacyOrgKey
  } );
};
const getOrgKeyByUuid = (org, uuid) => {
  if( org.orgKeys2 ) {
    const orgKey = org.orgKeys2.find( o => {
      return( o.orgKeyUuid == uuid );
    } );
    if( orgKey ) return( orgKey );
  }

  if( org.orgKeys ) {
    const index = org.orgKeys.indexOf( uuid );
    if( index >= 0 ) return getLegacyOrgKeyObject( org.orgKeys[index] );
  }

  throw new Error( `OrgKey '${uuid}' not found for organization ${org._id}` );
};

module.exports = { getOrgForOrgKey, getOrg, verifyAdminOrgKey, encryptOrgData, decryptOrgData, bestOrgKey, getOrgKeyByUuid, getLegacyOrgKeyObject };
