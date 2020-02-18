const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const ebl = require('express-bunyan-logger');
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const mongoConf = require('../../conf.js').conf;
const MongoClientClass = require('../../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);
const conf = require('../../conf.js').conf;
const S3ClientClass = require('../../s3/s3Client');
const uuid = require('uuid/v4');
const url = require('url');
const crypto = require('crypto');
const tokenCrypt = require('../../utils/crypt');
const algorithm = 'aes-256-cbc';

const getOrg = require('../../utils/orgs.js').getOrg;
const requireAuth = require('../../utils/api_utils.js').requireAuth;

router.use(ebl(getBunyanConfig('razee-api/v1Channels')));

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

// get all channels for an org
//   curl --request GET \
//     --url http://localhost:3333/api/v1/channels \
//     --header 'razee-org-key: orgApiKey-api-key-goes-here'
router.get('/', getOrg, requireAuth, asyncHandler(async(req, res)=>{
  try {
    const orgId = req.org._id;
    const Channels = req.db.collection('channels');
    const channels = await Channels.find({ org_id: orgId }).toArray();
    res.status(200).json({status: 'success', channels: channels});
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ status: 'error', message: error}); 
  }
}));

// create a new channel 
//   curl --request POST \
//     --url http://localhost:3333/api/v1/channels\
//     --header 'content-type: application/json' \
//     --header 'razee-org-key: orgApiKey-api-key-goes-here' \
//     --data '{"name": "channel-name-here"}'
router.post('/', getOrg, requireAuth, asyncHandler(async(req, res, next)=>{
  try {
    const orgId = req.org._id;
    const newDeployable = req.body.name;

    const Channels = req.db.collection('channels');
    const nameAlreadyExists = await Channels.find({
      org_id: orgId,
      name: newDeployable
    }).count();

    if(nameAlreadyExists) {
      res.status(403).json({ status: 'error', message: 'This deployable name already exists'  });
    } else {
      const deployableId = uuid();
      let resp = await Channels.insertOne({ 'org_id': orgId, 'name': newDeployable, 'uuid': deployableId, 'created': new Date(), 'versions': []}); 
      if(resp.insertedCount == 1) {
        const UserLog = req.db.collection('user_log');
        const userId = req.get('x-user-id');
        UserLog.insertOne({ userid: userId, action: 'addChannel', message: `API: Add channel ${orgId}:${newDeployable}`, created: new Date() });
        res.status(200).json({ status: 'success', id: deployableId, 'name': newDeployable }); 
      } else {
        res.status(403).json({ status: 'error', message: 'Error inserting a new deployable'}); 
      }
    }
  } catch (error) {
    req.log.error(error);
    next(error);
  }
}));

// Get yaml for a channel. Retrieves this data either from mongo or from COS
//   curl --request GET \
//   --url http://localhost:3333/api/v1/channels/:channelName/:versionId \
//   --header 'razee-org-key: orgApiKey-api-key-goes-here' \
router.get('/:channelName/:versionId', getOrg, asyncHandler(async(req, res, next)=>{
  var orgId = req.org._id;
  var channelName = req.params.channelName + '';
  var versionId = req.params.versionId + '';
  var Channels = req.db.collection('channels');
  var DeployableVersions = req.db.collection('deployableVersions');

  var deployable = await Channels.findOne({ org_id: orgId, name: channelName});
  if(!deployable){
    res.status(404).send({status: 'error', message: `channel "${channelName}" not found for this org`});
    return;
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
        const key = Buffer.concat([Buffer.from(req.orgKey)], 32);
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
      const data = tokenCrypt.decrypt(deployableVersion.content, req.orgKey);
      res.set('Content-Type', deployableVersion.type);
      res.status(200).send(data);
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error }); 
    }
  }
}));

// Get an individual channel object
//   curl --request GET \
//   --url http://localhost:3333/api/v1/channels/:channelName \
//   --header 'razee-org-key: orgApiKey-api-key-goes-here' \
router.get('/:channelName', getOrg, requireAuth, asyncHandler(async(req, res)=>{
  const orgId = req.org._id;
  const channelName = req.params.channelName + '';

  try {
    const Channels = req.db.collection('channels');
    const channel = await Channels.findOne({ org_id: orgId, name: channelName});
    if(!channel){
      res.status(404).send({status: 'error', message: `channel ${channelName} not found for this org`});
      return;
    } else {
      return res.status(200).send({status: 'success', channel: channel});
    }
  } catch (error) {
    return res.status(500).send({status: 'error', message: error});
  }
}));

module.exports = router;
