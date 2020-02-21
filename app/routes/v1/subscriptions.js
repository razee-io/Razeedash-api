const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const ebl = require('express-bunyan-logger');
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const mongoConf = require('../../conf.js').conf;
const MongoClientClass = require('../../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);

const getOrg = require('../../utils/orgs.js').getOrg;
const requireAuth = require('../../utils/api_utils.js').requireAuth;

router.use(ebl(getBunyanConfig('razee-api/v1Subscriptions')));

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

const getSubscriptions = async (req, res) => {
  try {
    const orgId = req.org._id;
    const Subscriptions = req.db.collection('subscriptions');
    const results = await Subscriptions.find({ org_id: orgId }).toArray();
    res.status(200).json({status: 'success', subscriptions: results });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ status: 'error', message: error}); 
  }
};

const setSubscriptionVersion = async (req, res) => {
  try {
    const orgId = req.org._id;
    const subscriptionId = req.params.id + '';
    const versionId = req.body.version;

    if (!subscriptionId) {
      return res.status(400).send('A subscription uuid was not included in the POST request');
    }
    if(!versionId) {
      return res.status(400).send('A version uuid was not included in the POST request');
    }

    const DeployableVersions = req.db.collection('deployableVersions');
    const deployable = await DeployableVersions.findOne({ org_id: orgId, uuid: versionId});

    const Subscriptions = req.db.collection('subscriptions');
    const subscriptionExists = await Subscriptions.find({ org_id: orgId, uuid: subscriptionId }).count();
    
    if(subscriptionExists && deployable) {
      const UserLog = req.db.collection('user_log');
      const userId = req.get('x-user-id');
      UserLog.insertOne({ userid: userId, action: 'setSubscriptionVersion', message: `API: Set a version for a subscription ${orgId}:${subscriptionId}:${deployable.name}:${deployable.channel_name}`, created: new Date() });

      await Subscriptions.updateOne(
        { org_id: orgId, uuid: subscriptionId },
        { $set: { 
          version_uuid: versionId, 
          version: deployable.name, 
          channel_uuid: deployable.channel_id, 
          channel: deployable.channel_name
        }} 
      );
      res.status(200).json({ status: 'success' }); 
    } else {
      req.log.error('error updating the subscription', deployable, subscriptionExists);
      res.status(403).send({status: 'error updating the subscription'});
    }
  } catch (error) {
    req.log.error(error);
    res.status(500).send('Error setting a channel version');
    return;
  }
};
// get all subscriptions for an org
// curl --request GET \
//     --url http://localhost:3333/api/v1/subscriptions \
//     --header 'razee-org-key: orgApiKey-api-key-goes-here' \
router.get('/', getOrg, requireAuth, asyncHandler(getSubscriptions));
  
// Set a channel version for a subscription 
//   curl --request POST \
//     --url http://localhost:3333/api/v1/subscriptions/:subscriptionId/version \
//     --header 'content-type: application/json' \
//     --header 'razee-org-key: orgApiKey-api-key-goes-here' \
//     --data '{"version": "version-uuid-here"}'
router.post('/:id/version', getOrg, requireAuth, asyncHandler(setSubscriptionVersion));

module.exports = router;
