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
const uuid = require('uuid');
const request = require('request-promise-native');
const objectPath = require('object-path');
const { URL } = require('url');

const WEBHOOK_TRIGGER_IMAGE = 'image';
const WEBHOOK_TRIGGER_CLUSTER = 'cluster';

// fireWebhook - private method for calling a web hook
const fireWebhook = async (webhook, postData, req) => {
  var success = true;
  var webhookId = webhook.id;
  var url = webhook.service_url;
  var hasError = false;
  var resp = '';
  postData.request_id = uuid();
  const options = {
    method: 'POST',
    uri: url,
    body: postData,
    json: true
  };
  req.log.debug(options, 'fireWebhook');

  try {
    req.log.debug({ org_id: req.org._id, options: options }, 'POSTing webhook');
    resp = await request(options);
  }
  catch (e) {
    success = false;
    hasError = true;
    resp = e;
    req.log.error({ err: e.message, url }, 'Error POSTing webhook');
  }
  var logObj = {
    webhook_id: webhookId,
    org_id: req.org._id,
    kind: webhook.kind,
    req: {
      url: url,
      payload: JSON.stringify(postData),
    },
    res: JSON.stringify(resp),
    hasError,
    created: new Date(),
  };
  const WebhookLogs = req.db.collection('webhookLogs');
  WebhookLogs.insert(logObj);
  return success;
};

// processWebhooks - private method for filtering and executing web hooks
const processWebhooks = async (webhooks, postData, resourceObj, req) => {
  req.log.debug(webhooks, 'processWebhooks');
  var success = true;
  await Promise.all(webhooks.map(async (webhook) => {
    // Test if optional filter
    var match = true;
    if (webhook.filter) {
      var field = objectPath.get(resourceObj, webhook.field);
      if (!field.match(webhook.filter)) {
        match = false;
      }
    }
    if (match) {
      postData.webhook_id = webhook._id;
      if (!await fireWebhook(webhook, postData, req)) {
        success = false;
      }
    }
  }));
  return success;
};

// triggerWebhooksForImage - Calls any web hooks defined for new images
const triggerWebhooksForImage = async (image_id, name, req) => {
  req.log.debug({ org_id: req.org._id, image_id: image_id, imageName: name }, 'triggerWebhooksForImageId');
  try {
    const callbackURL = new URL('v2/callback', process.env.RAZEEDASH_API_URL);
    const Webhooks = req.db.collection('webhooks');
    const webhooks = await Webhooks.find({ org_id: req.org._id, trigger: WEBHOOK_TRIGGER_IMAGE }).toArray();
    const postData = {
      org_id: req.org._id,
      image_name: name,
      image_id: image_id,
      callback_url: callbackURL
    };
    return processWebhooks(webhooks, postData, { name: name, image_id: image_id }, req);
  } catch (err) {
    req.log.error(err);
    return false;
  }
};

// triggerWebhooksForCluster - Calls any web hooks for changed resources on a cluster
const triggerWebhooksForCluster = async (clusterId, resourceObj, req) => {
  req.log.debug({ org_id: req.org._id, cluster_id: clusterId }, 'triggerWebhooksForImageId');
  try {
    const callbackURL = new URL('v2/callback', process.env.RAZEEDASH_API_URL);
    const Webhooks = req.db.collection('webhooks');
    const Clusters = req.db.collection('clusters');
    const webhooks = await Webhooks.find({ org_id: req.org._id, cluster_id: clusterId, trigger: WEBHOOK_TRIGGER_CLUSTER, kind: resourceObj.searchableData.kind }).toArray();
    const cluster = await Clusters.findOne({ org_id: req.org._id, cluster_id: clusterId });
    const metadata = cluster.metadata || [];
    const postData = {
      org_id: req.org._id,
      cluster_id: clusterId,
      cluster_metadata: metadata,
      resource_id: clusterId,
      resource_kind: resourceObj.searchableData.kind,
      resource: resourceObj,
      callback_url: callbackURL
    };
    return processWebhooks(webhooks, postData, resourceObj, req);
  } catch (err) {
    req.log.error(err);
    return false;
  }
};

const insertClusterBadge = async (webhook, badge, req) => {
  const Clusters = req.db.collection('clusters');
  const cluster = await Clusters.findOne({ cluster_id: webhook.cluster_id, org_id: req.org._id });
  if (cluster) {
    cluster.badges = cluster.badges || [];
    const foundIndex = cluster.badges.findIndex(x => x.webhook_id == badge.webhook_id);
    req.log.info(foundIndex,'foundIndex');
    if (foundIndex == -1) {
      cluster.badges.push(badge);
    } else {
      cluster.badges[foundIndex] = badge;
    }
    await Clusters.updateOne({ _id: cluster._id }, { $set: { badges: cluster.badges } });
  }
  return cluster;
};


const insertImageBadge = async (badge, req) => {
  const Images = req.db.collection('images');
  const image = await Images.findOne({ image_id: badge.image_id, org_id: req.org._id });
  if (image) {
    image.badges = image.badges || [];
    const foundIndex = image.badges.findIndex(x => x.webhook_id == badge.webhook_id);
    if (foundIndex == -1) {
      image.badges.push(badge);
    } else {
      image.badges[foundIndex] = badge;
    }
    await Images.updateOne({ image_id: badge.image_id }, { $set: { badges: image.badges } });
  }
  return image;
};

module.exports = {
  insertClusterBadge,
  insertImageBadge,
  triggerWebhooksForCluster,
  triggerWebhooksForImage,
  WEBHOOK_TRIGGER_IMAGE,
  WEBHOOK_TRIGGER_CLUSTER
};
