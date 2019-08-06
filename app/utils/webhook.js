const uuid = require('uuid');
const request = require('request-promise-native');

export const WEBHOOOK_KIND_IMAGE='image';
export const WEBHOOOK_KIND_CLUSTER='cluster';

const fireWebhook = async(webhook, postData, req) => {
  var success = true;
  var webhookId = webhook.id;
  var url = webhook.url;
  var hasError = false;
  var resp = '';
  postData.request_id = uuid();
  const options = {
    method: 'POST',
    uri: url,
    body: postData,
    json: true
  };
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

export const triggerWebhooksForImage = async(image_id, name, req) => {
  req.log.debug({ org_id: req.org._id, image_id: image_id, imageName: name }, 'triggerWebhooksForImageId');
  var webhooks = req.org.webhooks || [];
  var postData = {
    org_id: req.org._id,
    image_name: name,
    image_id: image_id,
  };
  var success = true;

  webhooks.forEach( async (webhook) => {
    var match = true;
    if ((webhook.pattern) && !name.match(webhook.pattern)) {
      match = false;
    }
    if (match) {
      if (!await fireWebhook(webhook,postData,req)) {
        success = false;
      }
    }
  });
  return success;
};
