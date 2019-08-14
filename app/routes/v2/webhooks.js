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
const jkValidate = require('json-key-validate');

const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const { WEBHOOK_TRIGGER_CLUSTER, WEBHOOK_TRIGGER_IMAGE, insertClusterBadge, insertImageBadge } = require('../../utils/webhook.js');

router.use(ebl(getBunyanConfig('razeedash-api/webhooks')));

// Callback from triggered webhook
const addCallbackResult = async (req, res, next) => {
  try {
    const Webhooks = req.db.collection('webhooks');
    const webhook = await Webhooks.findOne({ _id: req.params.webhook_id });
    if (webhook) {
      // Make sure webhook is still active
      if (webhook.deleted == true) {
        res.status(404).send('Web hook has been deleted');
      } else {
        // Validate badge properties
        let badge = req.body;
        badge.webhook_id = req.params.webhook_id;
        let properties = ['webhook_id', 'url', 'description', 'link', 'status'];
        const isValid = jkValidate(badge, properties);
        if (!isValid) {
          res.status(400).send(`Missing properties, make sure the following fields are defined: ${JSON.stringify(properties)}`);
        } else {
          // determine resource to add badge
          // if resource not currently used return 404
          if (webhook.trigger == WEBHOOK_TRIGGER_CLUSTER) {
            const cluster = await insertClusterBadge(webhook, badge, req);
            if (cluster) {
              res.status(201);
            } else { // should never happen
              res.log.error({badge: badge, webhook: webhook}, 'cluster missing while processing badge ');
              res.status(500);
            }
          } else if (webhook.trigger == WEBHOOK_TRIGGER_IMAGE) {
            const image = await insertImageBadge(webhook, badge, req);
            if (image) {
              res.status(201);
            } else { // should never happen
              res.log.error({badge: badge, webhook: webhook}, 'image missing while processing badge ');
              res.status(500);
            }
          } else { // should never happen
            res.log.error({badge: badge, webhook: webhook}, 'Unknown webhook trigger defined in database');
            res.status(500).send('unknown trigger');
          }
        }
      }
    } else {
      res.status(404).send('Web hook not found');
    }
  } catch (err) {
    req.log.error(err);
    next(err);
  }
};

const addWebhook = async (req, res, next) => {
  try {
    let webhook = req.body;
    const Webhooks = req.db.collection('webhooks');
    if (webhook.trigger == WEBHOOK_TRIGGER_CLUSTER) {
      const Clusters = req.db.collection('clusters');
      const result = await Clusters.findOne({ cluster_id: webhook.cluster_id, org_id: req.org._id });
      if ((!result) || (result && result.deleted == true)) {
        res.status(404).send(`Cluster ${webhook.cluster_id} not found or has been deleted`);
      } else {
        await Webhooks.insertOne(webhook);
        res.status(201);
      }
    } else {
      await Webhooks.insertOne(webhook);
      res.status(201);
    }
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