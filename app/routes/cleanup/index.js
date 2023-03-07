/**
 * Copyright 2023 IBM Corp. All Rights Reserved.
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
const axios = require('axios');
const { RDD_STATIC_ARGS } = require('../../apollo/models/const');

router.get('/razeedeploy-job', asyncHandler(async (req, res, next) => {
  let args = req.query.args ? req.query.args : [];
  let args_array = Array.isArray(args) ? args : [args];
  let host = req.get('host');
  if (process.env.EXTERNAL_HOST) {
    host = process.env.EXTERNAL_HOST;
  }
  args_array.push(`--razeedash-url=${req.protocol}://${host}/api/v2`);
  args_array.push( ...RDD_STATIC_ARGS );
  args_array = JSON.stringify(args_array);

  try {
    // allow custom job, agents versions and image location to be provided
    const rddJobUrl = process.env.RDD_JOB_URL || 'https://github.com/razee-io/razeedeploy-delta/releases/latest/download/job.yaml';

    const rdd_job = await axios.get(rddJobUrl);
    const view = {
      NAMESPACE: req.query.namespace || 'razeedeploy',
      COMMAND: req.query.command || 'remove',
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

module.exports = router;
