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
const yaml = require('js-yaml');
const { getRddArgs } = require('../../utils/rdd');

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
Serves a System Subscription that returns a CronJob that updates the operators: Cluster Subscription, Remote Resource and Watch-Keeper
*/
const getOperatorsSubscription = async(req, res) => {
  // Get the image and command for the update cronjob from the current values returned from the razeedeploy-job api
  const protocol = req.protocol || 'http';
  let host = req.header('host') || 'localhost:3333';
  if (process.env.EXTERNAL_HOST) {
    host = process.env.EXTERNAL_HOST;
  }
  let job = await axios( {
    method: 'get',
    url: `${protocol}://${host}/api/install/razeedeploy-job`,
    headers: {
      'razee-org-key': bestOrgKey(req.org).key
    }
  });
  job = yaml.loadAll(job.data);
  const image = job[4].spec.template.spec.containers[0].image;
  const command = job[4].spec.template.spec.containers[0].command[0];

  let args = '';
  const rddArgs = await getRddArgs();
  if (rddArgs.length > 0) {
    rddArgs.forEach(arg => {
      args += `"${arg}", `;
    });
  }

  const razeeupdateYaml = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: razeeupdate
  namespace: razeedeploy
spec:
  schedule: "@midnight"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: 60
      backoffLimit: 1
      activeDeadlineSeconds: 300
      template:
        spec:
          serviceAccountName: razeedeploy-sa
          containers:
          - name: razeeupdate
            image: "${ image }"
            imagePullPolicy: Always
            command: 
              [
                "${ command }",
                "update",
                "--namespace=razeedeploy"
              ]
            args:
              [
                ${ args }
              ]
          restartPolicy: Never
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: razeedeploy-sa
  namespace: razeedeploy
`;

  res.status( 200 ).send( razeeupdateYaml );
};

// /api/v2/systemSubscriptions/primaryOrgKey
router.get('/primaryOrgKey', getOrg, asyncHandler(getPrimaryOrgKeySubscription));
router.get('/operators', asyncHandler(getOperatorsSubscription));


module.exports = router;
