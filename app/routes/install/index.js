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

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Mustache = require('mustache');
const readFile = require('fs-readfile-promise');
const axios = require('axios');
const { CLUSTER_REG_STATES } = require('../../apollo/models/const');
const { getRddJobUrl } = require('../../utils/rdd');

router.get('/razeedeploy-job', asyncHandler(async (req, res, next) => {
  const orgKey = req.orgKey;
  let args = req.query.args ? req.query.args : [];
  let args_array = Array.isArray(args) ? args : [args];
  let host = req.get('host');
  if (process.env.EXTERNAL_HOST) {
    host = process.env.EXTERNAL_HOST;
  }
  args_array.push(`--razeedash-url=${req.protocol}://${host}/api/v2`);
  args_array.push(`--razeedash-org-key=${orgKey}`);
  if(req.query.clusterId) {
    args_array.push(`--razeedash-cluster-id=${req.query.clusterId}`);
    try {
      // populate registration data into --razeedash-cluster-metadata64
      const Clusters = req.db.collection('clusters');
      const preUpdatedCluster = await Clusters.findOneAndUpdate(
        {org_id: req.org._id, cluster_id: req.query.clusterId, reg_state: CLUSTER_REG_STATES.REGISTERING},
        {$set: {reg_state: CLUSTER_REG_STATES.PENDING}});
      if (preUpdatedCluster && preUpdatedCluster.value) {
        req.log.debug(`preUpdatedCluster = ${JSON.stringify(preUpdatedCluster)}`);
        const valuesString = JSON.stringify(preUpdatedCluster.value.registration);
        const base64String = Buffer.from(valuesString).toString('base64');
        args_array.push(`--razeedash-cluster-metadata64=${base64String}`);
      } else {
        const error = new Error(`Can not find and update the cluster registration state for cluster_id ${req.query.clusterId}`);
        req.log.error(error);
        res.setHeader('content-type', 'application/json');
        res.status(410).send({error: error.message});
        return;
      }
    } catch (err) {
      req.log.error(err.message);
      next(err);
      return;
    }
  }
  args_array = JSON.stringify(args_array);

  try {
    // allow custom job, agents versions and image location to be provided
    const rddJobUrl = await getRddJobUrl();

    const rdd_job = await axios.get(rddJobUrl);
    const view = {
      NAMESPACE: req.query.namespace || 'razeedeploy',
      COMMAND: req.query.command || 'install',
      ARGS_ARRAY: args_array,
      UUID: `-${Date.now()}`
    };
    const m_esc = Mustache.escape;
    Mustache.escape = (text) => { return text; };
    const configYaml = Mustache.render(rdd_job.data, view);
    Mustache.escape = m_esc;
    res.setHeader('content-type', 'application/yaml');
    return res.status(200).send(configYaml);
  } catch (e) {
    req.log.error(e);
    next(e);
  }
}));

// =============================================================================
// DEPRICATED ROUTES:
// These routes are being depricated. please use '/job'
// =============================================================================
router.get('/inventory', asyncHandler(async (req, res, next) => {
  const orgKey = req.orgKey;
  var razeeapiUrl = `${req.protocol}://${req.get('host')}/api/v2`;
  const wk_url = 'https://github.com/razee-io/Watch-keeper/releases/download/0.2.0/resource.yaml';
  try {
    const inventory = await readFile(`${__dirname}/inventory.yaml`, 'utf8');
    const wk = await axios.get(wk_url);
    const view = {
      RAZEEDASH_URL: razeeapiUrl,
      RAZEEDASH_ORG_KEY: Buffer.from(orgKey).toString('base64'),
      WATCH_KEEPER: wk.data
    };
    const configYaml = Mustache.render(inventory, view);
    res.setHeader('content-type', 'application/yaml');
    return res.status(200).send(configYaml);
  } catch (e) {
    req.log.error(e);
    next(e);
  }
}));

router.get('/razeedeploy', asyncHandler(async (req, res, next) => {
  const orgKey = req.orgKey;
  var razeeapiUrl = `${req.protocol}://${req.get('host')}/api/v2`;
  const wk_url = 'https://github.com/razee-io/Watch-keeper/releases/download/0.2.0/resource.yaml';
  const kptn_url = 'https://github.com/razee-io/razeedeploy-delta/releases/latest/download/resource.yaml';
  try {
    const inventory = await readFile(`${__dirname}/razeedeploy.yaml`, 'utf8');
    const wk = await axios.get(wk_url);
    const kptn = await axios.get(kptn_url);
    const view = {
      RAZEEDASH_URL: razeeapiUrl,
      RAZEEDASH_ORG_KEY: Buffer.from(orgKey).toString('base64'),
      WATCH_KEEPER: wk.data,
      RAZEEDEPLOY: kptn.data
    };
    const configYaml = Mustache.render(inventory, view);
    res.setHeader('content-type', 'application/yaml');
    return res.status(200).send(configYaml);
  } catch (e) {
    req.log.error(e);
    next(e);
  }
}));

router.get('/cluster', asyncHandler(async (req, res, next) => {
  const orgKey = req.orgKey;
  var razeeapiUrl = `${req.protocol}://${req.get('host')}/api/v2`;
  const kptn_url = 'https://github.com/razee-io/razeedeploy-delta/releases/latest/download/resource.yaml';
  const remoteResource_url = 'https://github.com/razee-io/RemoteResource/releases/latest/download/resource.yaml';
  try {
    const inventory = await readFile(`${__dirname}/cluster.yaml`, 'utf8');
    const rr = await axios.get(remoteResource_url);
    const kptn = await axios.get(kptn_url);
    const view = {
      RAZEEDASH_URL: razeeapiUrl,
      RAZEEDASH_ORG_KEY: Buffer.from(orgKey).toString('base64'),
      REMOTE_RESOURCE: rr.data,
      RAZEEDEPLOY: kptn.data
    };
    const configYaml = Mustache.render(inventory, view);
    res.setHeader('content-type', 'application/yaml');
    return res.status(200).send(configYaml);
  } catch (e) {
    req.log.error(e);
    next(e);
  }
}));

router.get('/razeedeploy/:component', asyncHandler(async (req, res, next) => {
  const kptn_url = `https://github.com/razee-io/${req.params.component}/releases/latest/download/resource.yaml`;
  try {
    const kptn = await axios.get(kptn_url);
    res.setHeader('content-type', 'application/yaml');
    return res.status(200).send(kptn.data);
  } catch (e) {
    req.log.error(e);
    next(e);
  }
}));
// =============================================================================
// DEPRICATED ROUTES
// =============================================================================


module.exports = router;
