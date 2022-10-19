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
const request = require('request-promise-native');
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

const getClusterSubscriptionSubscription = async(req, res) => {
  let version;
  let url;
  if (RDD_STATIC_ARGS.length > 0) {
    RDD_STATIC_ARGS.forEach(arg => {
      if (arg.includes('clustersubscription')) {
        version = arg.slice(arg.lastIndexOf('=') + 1);
      }
    });
  }

  if (version) {
    url = `https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/ClusterSubscription/${version}/us/resource.yaml`;
  } else {
    url = 'https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/ClusterSubscription/latest/template/resource.yaml';
  }

  const clusterSubscriptionYaml = await request(url);

  res.status( 200 ).send( clusterSubscriptionYaml );
};

const getRemoteResourceSubscription = async(req, res) => {
  let version;
  let url;
  if (RDD_STATIC_ARGS.length > 0) {
    RDD_STATIC_ARGS.forEach(arg => {
      if (arg.includes('remoteresource')) {
        version = arg.slice(arg.lastIndexOf('=') + 1);
      }
    });
  }

  if (version) {
    url = `https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/RemoteResource/${version}/us/resource.yaml`;
  } else {
    url = 'https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/RemoteResource/latest/template/resource.yaml';
  }

  const remoteResourceYaml = await request(url);

  res.status( 200 ).send( remoteResourceYaml );
};

const getWatchKeeperSubscription = async(req, res) => {
  let version;
  let url;
  if (RDD_STATIC_ARGS.length > 0) {
    RDD_STATIC_ARGS.forEach(arg => {
      if (arg.includes('watch-keeper')) {
        version = arg.slice(arg.lastIndexOf('=') + 1);
      }
    });
  }

  if (version) {
    url = `https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/WatchKeeper/${version}/us/resource.yaml`;
  } else {
    url = 'https://s3.us.cloud-object-storage.appdomain.cloud/razee-io/WatchKeeper/latest/template/resource.yaml';
  }

  const watchKeeperYaml = await request(url);

  res.status( 200 ).send( watchKeeperYaml );
};

// /api/v2/systemSubscriptions/primaryOrgKey
router.get('/primaryOrgKey', getOrg, asyncHandler(getPrimaryOrgKeySubscription));
router.get('/clusterSubscription', asyncHandler(getClusterSubscriptionSubscription));
router.get('/remoteResource', asyncHandler(getRemoteResourceSubscription));
router.get('/watchKeeper', asyncHandler(getWatchKeeperSubscription));


module.exports = router;
