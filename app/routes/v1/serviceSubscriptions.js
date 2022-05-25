/**
* Copyright 2022 IBM Corp. All Rights Reserved.
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

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const getOrg = require('../../utils/orgs.js').getOrg;

/*
Best OrgKey value is:
- First found OrgKeys2 key marked as Primary
- First found OrgKeys2 key if no Primary identified
- First OrgKeys OrgKey if no OrgKeys2 exist
*/
const bestOrgKeyValue = (org) => {
  if( org.orgKeys2 && org.orgKeys2.length > 0 ) {
    const bestOrgKey = org.orgKeys2.find( o => {
      return( o.primary );
    } );
    return( bestOrgKey.key || org.orgKeys2[0].key );
  }
  else if( org.orgKeys && org.orgKeys.length > 0 ) {
    return( org.orgKeys[0] );
  }

  throw new Error( `No valid OrgKey found for organization ${org._id}` );
};

/*
Serves a System Subscription that regenerates the `razee-identity` secret with the 'best' OrgKey value.
*/
const getPrimaryOrgKeySubscription = async(req, res) => {
  const razeeIdentitySecretYaml = `apiVersion: v1
kind: Secret
metadata:
  name: razee-identity
  namespace: razeedeploy
  labels:
    razee/watch-resource: lite
    addonmanager.kubernetes.io/mode: Reconcile
data:
  RAZEE_ORG_KEY: ${btoa( bestOrgKeyValue( req.org ) )}
type: Opaque
`;

  res.status( 200 ).send( razeeIdentitySecretYaml );
};

// /api/v2/serviceSubscriptions/primaryOrgKey
router.get('/primaryOrgKey', getOrg, asyncHandler(getPrimaryOrgKeySubscription));


module.exports = router;
