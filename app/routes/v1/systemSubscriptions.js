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
const { getOrg, bestOrgKeyValue } = require('../../utils/orgs');

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
  RAZEE_ORG_KEY: ${Buffer.from( bestOrgKeyValue( req.org ) ).toString('base64')}
type: Opaque
`;

  res.status( 200 ).send( razeeIdentitySecretYaml );
};

// /api/v2/systemSubscriptions/primaryOrgKey
router.get('/primaryOrgKey', getOrg, asyncHandler(getPrimaryOrgKeySubscription));


module.exports = router;
