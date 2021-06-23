const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const mongoConf = require('../../conf.js').conf;
const MongoClientClass = require('../../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);
const storageFactory = require('./../../storage/storageFactory');
const getOrg = require('../../utils/orgs.js').getOrg;

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

// Get yaml for a channel. Retrieves this data either from mongo or from COS
//   curl --request GET \
//   --url http://localhost:3333/api/v1/channels/:channelName/:versionId \
//   --header 'razee-org-key: orgApiKey-api-key-goes-here' \
router.get('/:channelName/:versionId', getOrg, asyncHandler(async(req, res)=>{
  var orgId = req.org._id;
  var orgKey = req.orgKey;
  var channelName = req.params.channelName + '';
  var versionId = req.params.versionId + '';
  var Channels = req.db.collection('channels');
  var ServiceSubscriptions = req.db.collection('serviceSubscriptions');
  var Clusters = req.db.collection('clusters');
  var Orgs = req.db.collection('orgs');
  var DeployableVersions = req.db.collection('deployableVersions');

  var deployable = await Channels.findOne({ org_id: orgId, name: channelName});
  if (!deployable) {
    // If there are any service-subscriptions pushing this channel/version into any clusters owned by this org
    // then the request is legitimate even though requester's org does not own the channel/version.
    const ourClusters = await Clusters.find({ org_id: orgId, reg_state: 'registered' }).toArray();
    const ourClusterIds = ourClusters.map(c => c.cluster_id);
    const ourServiceSubscription = await ServiceSubscriptions.findOne({
      version_uuid: versionId,
      clusterId: { $in: ourClusterIds }
    });
    if (ourServiceSubscription) {
      req.log.debug(`Target service clusters for version_uuid ${versionId} are ${ourClusterIds}`);
      orgId = ourServiceSubscription.org_id;
      orgKey = (await Orgs.findOne({ _id: orgId })).orgKeys[0];
      deployable = await Channels.findOne({ org_id: orgId, name: channelName});
    } else {
      res.status(404).send({ status: 'error', message: `channel "${channelName}" not found for this org` });
      return;
    }
  }

  var deployableVersion = await DeployableVersions.findOne({ org_id: orgId, channel_id: deployable.uuid, uuid: versionId });
  if(!deployableVersion){
    res.status(404).send({status: 'error', message: `versionId "${versionId}" not found`});
    return;
  }

  try {
    const handler = storageFactory(req.log).deserialize(deployableVersion.content);
    const data = await handler.getDataAndDecrypt(orgKey, deployableVersion.iv);
    res.set('Content-Type', deployableVersion.type);
    res.status(200).send(data);
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ status: 'error', message: error.message});
  }

}));

module.exports = router;
