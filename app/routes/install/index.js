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
const ebl = require('express-bunyan-logger');
const Mustache = require('mustache');
const readFile = require('fs-readfile-promise');
const request = require('request-promise-native');
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;

router.use(ebl(getBunyanConfig('/api/install')));


router.get('/razeedeploy-job', asyncHandler(async (req, res, next) => {
  let args = req.query.args ? req.query.args : [];
  let args_array = Array.isArray(args) ? args : [args];
  args_array.push(`--razeedash-url='${req.protocol}://${req.get('host')}/api/v2'`);
  args_array.push(`--razeedash-org-key=${req.query.orgKey}`);
  args_array = JSON.stringify(args_array);

  try {
    const rdd_job = await request.get('https://github.com/razee-io/razeedeploy-delta/releases/latest/download/job.yaml');
    const view = {
      NAMESPACE: req.query.namespace || 'razeedeploy',
      COMMAND: req.query.command || 'install',
      ARGS_ARRAY: args_array
    };
    const m_esc = Mustache.escape;
    Mustache.escape = (text) => { return text; };
    const configYaml = Mustache.render(rdd_job, view);
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
    const wk = await request.get(wk_url);
    const view = {
      RAZEEDASH_URL: razeeapiUrl,
      RAZEEDASH_ORG_KEY: Buffer.from(orgKey).toString('base64'),
      WATCH_KEEPER: wk
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
    const wk = await request.get(wk_url);
    const kptn = await request.get(kptn_url);
    const view = {
      RAZEEDASH_URL: razeeapiUrl,
      RAZEEDASH_ORG_KEY: Buffer.from(orgKey).toString('base64'),
      WATCH_KEEPER: wk,
      RAZEEDEPLOY: kptn
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
    const rr = await request.get(remoteResource_url);
    const kptn = await request.get(kptn_url);
    const view = {
      RAZEEDASH_URL: razeeapiUrl,
      RAZEEDASH_ORG_KEY: Buffer.from(orgKey).toString('base64'),
      REMOTE_RESOURCE: rr,
      RAZEEDEPLOY: kptn
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
    const kptn = await request.get(kptn_url);
    res.setHeader('content-type', 'application/yaml');
    return res.status(200).send(kptn);
  } catch (e) {
    req.log.error(e);
    next(e);
  }
}));
// =============================================================================
// DEPRICATED ROUTES
// =============================================================================


module.exports = router;
