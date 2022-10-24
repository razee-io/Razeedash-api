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
const { getOrg, bestOrgKey } = require('../../utils/orgs');
const axios = require('axios');
const { RDD_STATIC_ARGS } = require('../../apollo/models/const');

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
  RAZEE_ORG_KEY: ${Buffer.from( bestOrgKey( req.org ).key ).toString('base64')}
type: Opaque
`;

  res.status( 200 ).send( razeeIdentitySecretYaml );
};

/*
Serves a System Subscription that updates the operators: Cluster Subscription, Remote Resource and Watch-Keeper
*/
const getOperatorsSubscription = async(req, res) => {
  let csVer;
  let rrVer;
  let wkVer;
  let csurl;
  let rrurl;
  let wkurl;
  if (RDD_STATIC_ARGS.length > 0) {
    RDD_STATIC_ARGS.forEach(arg => {
      if (arg.includes('clustersubscription')) {
        csVer = arg.slice(arg.lastIndexOf('=') + 1);
      } else if (arg.includes('remoteresource')) {
        rrVer = arg.slice(arg.lastIndexOf('=') + 1);
      } else if (arg.includes('watch-keeper')) {
        wkVer = arg.slice(arg.lastIndexOf('=') + 1);
      }
    });
  }

  if (csVer) {
    csurl = `https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/ClusterSubscription/${csVer}/us/resource.yaml`;
  } else {
    csurl = 'https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/ClusterSubscription/latest/template/resource.yaml';
  }

  if (rrVer) {
    rrurl = `https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/RemoteResource/${rrVer}/us/resource.yaml`;
  } else {
    rrurl = 'https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/RemoteResource/latest/template/resource.yaml';
  }

  if (wkVer) {
    wkurl = `https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/WatchKeeper/${wkVer}/us/resource.yaml`;
  } else {
    wkurl = 'https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/WatchKeeper/latest/template/resource.yaml';
  }

  const csYaml = await axios.get(csurl);
  const rrYaml = await axios.get(rrurl);
  const wkYaml = await axios.get(wkurl);

  const operatorsYaml = csYaml.data + '---\n' + rrYaml.data + '---\n' + wkYaml.data;

  res.status( 200 ).send( operatorsYaml );
};

// /api/v2/systemSubscriptions/primaryOrgKey
router.get('/primaryOrgKey', getOrg, asyncHandler(getPrimaryOrgKeySubscription));
router.get('/operators', asyncHandler(getOperatorsSubscription));


module.exports = router;
