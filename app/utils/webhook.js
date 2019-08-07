const uuid = require('uuid');
const request = require('request-promise-native');
const objectPath = require('object-path');

const WEBHOOOK_KIND_IMAGE = 'image';

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
  req.log.info(options, 'fireWebhook');

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
  req.log.info(webhooks, 'postWebHooks');
  var success = true;
  await Promise.all( webhooks.map(async (webhook) => {
    // Test if optional filter
    var match = true;
    if (webhook.filter) {
      var field = objectPath.get(resourceObj, webhook.field);
      if (!field.match(webhook.filter)) {
        match = false;
      }
    }
    if (match) {
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
  const Webhooks = req.db.collection('webhooks');
  try {
    const webhooks = await Webhooks.find({ org_id: req.org._id, kind: WEBHOOOK_KIND_IMAGE }).toArray();
    var postData = {
      org_id: req.org._id,
      image_name: name,
      image_id: image_id,
    };
    return processWebhooks(webhooks, postData, { name: name, image_id: image_id }, req);
  } catch (err) {
    req.log.error(err);
    return false;
  }
};

// triggerWebhooksForCluster - Calls any web hooks for changed resources on a cluster
const triggerWebhooksForCluster = async (clusterId, resourceId, resourceObj, req) => {
  req.log.debug({ org_id: req.org._id, cluster_id: clusterId, resource_id: resourceId }, 'triggerWebhooksForImageId');
  const Webhooks = req.db.collection('webhooks');
  const Clusters = req.db.collection('clusters');
  const webhooks = await Webhooks.find({ org_id: req.org._id, cluster_id: clusterId, kind: resourceObj.kind }).toArray();
  const cluster = await Clusters.findOne({ org_id: req.org_id, cluster_id: clusterId });
  const metadata = cluster.metadata || [];
  var postData = {
    org_id: req.org._id,
    clsuter_name: metadata.name,
    cluster_id: clusterId,
    config_version: cluster.config_version,
    resource: resourceObj
  };
  return processWebhooks(webhooks, postData, resourceObj, req);
};

module.exports = {
  triggerWebhooksForCluster,
  triggerWebhooksForImage
};
