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

const getBunyanConfig = require('../utils/bunyan.js').getBunyanConfig;
const bunyan = require('bunyan');
const logger = bunyan.createLogger(getBunyanConfig('/'));

const Kube = require('./kube/kube.js');
const Install = require('./install/install.js');
const Cron = require('./cron/cron.js');
const Status = require('./v2/status.js');
const Clusters = require('./v2/clusters.js');

router.use('/kube', Kube);

router.use((req, res, next) => {
  const orgHeader = req.get('razee-org-key');
  if(!orgHeader){
    logger.warn(`razee-org-key not specified on route ${req.url}`);
  }
  next();
});

router.use('/api/v2/clusters', Clusters);
router.use('/api/v2/status', Status);
router.use('/install', Install);
router.use('/cron', Cron);

module.exports = router;
