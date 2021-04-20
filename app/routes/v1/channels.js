const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const mongoConf = require('../../conf.js').conf;
const MongoClientClass = require('../../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);
const conf = require('../../conf.js').conf;
const S3ClientClass = require('../../s3/s3Client');
const url = require('url');
const crypto = require('crypto');
const tokenCrypt = require('../../utils/crypt');
const algorithm = 'aes-256-cbc';

const getOrg = require('../../utils/orgs.js').getOrg;

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

// Get yaml for a channel. Retrieves this data either from mongo or from COS
//   curl --request GET \
//   --url http://localhost:3333/api/v1/channels/:channelName/:versionId \
//   --header 'razee-org-key: orgApiKey-api-key-goes-here' \
router.get('/:channelName/:versionId', getOrg, asyncHandler(async(req, res, next)=>{
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
    const serviceSubscriptions = await ServiceSubscriptions.find({ version_uuid: versionId }).toArray();
    const targetedClusters = serviceSubscriptions.map(i => i.clusterId);
    const ourClusters = await Clusters.find({ org_id: orgId, cluster_id: { $in: targetedClusters }, reg_state: "registered" }).toArray();
    if (ourClusters.length >0) {
      req.log.debug(`Targer service clusters for version_uuid ${versionId} are ${ourClusters.map(i => i.cluster_id)}`);
      orgId = serviceSubscriptions[0].org_id; // all service subscriptions pushing the same version_uuid will have the same org_id
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

  if(deployableVersion.location === 's3') {
    if (conf.s3.endpoint) {
      try {
        const s3Client = new S3ClientClass(conf);
        const link = url.parse(deployableVersion.content);
        const iv = Buffer.from(deployableVersion.iv, 'base64');
        const paths = link.path.split('/');
        const bucket = paths[1];
        const resourceName = decodeURI(paths[2]);
        const key = Buffer.concat([Buffer.from(orgKey)], 32);
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        const s3stream = s3Client.getObject(bucket, resourceName).createReadStream();
        s3stream.on('error', function(error) {
          req.log.error(error);
          return res.status(403).json({ status: 'error', message: error.message});
        });
        s3stream.pipe(decipher).pipe(res);
        s3stream.on('httpError', (error) => {
          req.log.error(error, 'Error GETting data using the S3 client');
          if (!res.headersSent) {
            res.status(error.statusCode || 500).json(error);
          } else {
            next(error);
          }
        });
      } catch (error) {
        return res.status(403).json({ status: 'error', message: error.message});
      }
    } else {
      return res.status(403).json({ status: 'error', message: 'An endpoint must be configured for the S3 client'});
    }
  } else {
    // in this case the resource was stored directly in mongo rather than in COS
    try {
      const data = tokenCrypt.decrypt(deployableVersion.content, orgKey);
      res.set('Content-Type', deployableVersion.type);
      res.status(200).send(data);
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error });
    }
  }
}));

module.exports = router;
