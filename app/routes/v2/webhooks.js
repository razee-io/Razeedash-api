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

const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;

router.use(ebl(getBunyanConfig('razeedash-api/webhooks')));

// Callback from triggered webhook
const addCallbackResult = async (req, res, next) => {
  try {
    const Webhooks = req.db.collection('webhooks');
    const webhook = Webhooks.findOne({webhook_id: req.params.webhook_id});
    if (webhook) {
      if (webhook.deleted == true) {
        res.status(404).send('Web hook has been deleted');
      }
    } else {
      res.status(404).send('Web hook not found');
    }
    // determine resource to add badge
    // if resource not currently used return 404
    // add/update badge based on webhook_id to the resource
    res.status(201);
  } catch (err) {
    req.log.error(err);
    next(err);
  }
};

const addWebhook = async (req, res, next) => {
  try {
    let webhook = req.body;
    if (webhook.trigger == 'cluster') {
      const Clusters = req.db.collection('clusters');
      const result = await Clusters.findOne({cluster_id: webhook.cluster_id, org_id: req.org._id});
      if ((!result) || (result.deleted == true)) {
        res.status(400).send(`Cluster ${webhook.cluster_id} not found or has been deleted`);
      }
    }
    const Webhooks = req.db.collection('webhooks');
    await Webhooks.insertOne(webhook);
    res.status(201);
  } catch (err) {
    req.log.error(err);
    next(err);
  }
};

// deleteWebhook - logical delete of webhook
const deleteWebhook = async (req, res, next) => {
  try {
    const Webhooks = req.db.collection('webhooks');
    await Webhooks.updateOne(
      { _id: req.params.webhook_id }, 
      { 
        $set: { deleted: true },
        $currentDate: { lastModified: true } 
      });
    res.status(204);
  } catch (err) {
    req.log.error(err.message);
    next(err);
  }
};

// POST /api/v2/webhooks/:id/callback
router.post('/:webhook_id/callback', asyncHandler(addCallbackResult));

// POST /api/v2/webhooks
router.post('/', asyncHandler(addWebhook));

// DELETE /api/v2/webhooks/:id
router.delete('/:webhook_id', asyncHandler(deleteWebhook));


module.exports = router;