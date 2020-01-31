const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const ebl = require('express-bunyan-logger');
const getBunyanConfig = require('../../utils/bunyan.js').getBunyanConfig;
const mongoConf = require('../../conf.js').conf;
const MongoClientClass = require('../../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);
const conf = require('../../conf.js').conf;
const uuid = require('uuid/v4');
const S3ClientClass = require('../../s3/s3Client');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';

const getOrg = require('../../utils/orgs.js').getOrg;
const requireAuth = require('../../utils/api_utils.js').requireAuth;
const encryptResource = require('../../utils/api_utils.js').encryptResource;

router.use(ebl(getBunyanConfig('razee-api/v1ChannelsStream')));

router.use(asyncHandler(async (req, res, next) => {
  req.db = await MongoClient.getClient();
  next();
}));

const checkOrg = (req, res, next) => {
  let orgKey = req.get('razee-org-key');
  if(!orgKey){
    orgKey = req.query.orgKey;
    if(!orgKey){
      return res.status(401).send( 'razee-org-key required for this route' );
    }
  }
  req.orgKey=orgKey;
  next();
};

// Create a new resource version for a channel. This route was created separate from 
// channels.js so we can have a route in src/server.js where body-parser isn't applied
// curl --request POST \
//   --url http://localhost:3333/api/v1/channels/:channelName/version \
//   --header 'content-type: [application/json | application/yaml]' \
//   --header 'razee-org-key: orgApiKey-api-key-goes-here' \
//   --header 'resource-name: name-of-the-new-resource-version' \
//   --header 'resource-description: optional-description-of-the-new-resource-version' \
//   --header 'x-api-key: razee-user-api-key' \
//   --header 'x-user-id: razee-user-id' \
//   --data @filename.goes.here.yaml
router.post('/:channelName/version', checkOrg, getOrg, requireAuth, asyncHandler(async(req, res)=>{
  try {
    if (!req.get('resource-name')) {
      return res.status(400).send('A resource-name name was not included in the header');
    }

    if (!req.get('content-type')) {
      return res.status(400).send('A Content-Type header of application/json or application/yaml must be included');
    }

    const version = {
      description: req.get('resource-description'),
      name: req.get('resource-name'),
      type: req.get('content-type')
    };

    version.uuid = uuid();
    
    if (!req.params.channelName) {
      return res.status(400).send('A channel name field was not included in the POST request');
    }
    
    const orgId = req.org._id;
    const channelName = req.params.channelName + '';
    const Channels = req.db.collection('channels');
    const DeployableVersions = req.db.collection('deployableVersions');
    const existingChannel = await Channels.findOne({
      org_id: orgId,
      name: channelName
    });

    if(existingChannel) {
      const versions = await DeployableVersions.find({channel_name: existingChannel.name}).toArray();
      const versionNameExists = versions.filter( (existingVersion) => existingVersion.name === version.name );

      if(versionNameExists && versionNameExists.length > 0) {
        return res.status(403).json({ status: 'error', message: `The version name ${version.name} already exists`}); 
      }

      let location, data;
      const iv = crypto.randomBytes(16);
      const ivText = iv.toString('base64');

      if (conf.s3.endpoint) {
        try {
          const resourceName =  existingChannel.name + '-' + version.name;
          const bucket = `${conf.s3.bucketPrefix}-${orgId.toLowerCase()}`;
          const s3Client = new S3ClientClass(conf);
          try {
            const exists = await s3Client.bucketExists(bucket);
            if (!exists) {
              req.log.warn({ bucket: bucket }, 'bucket does not exist');
              await s3Client.createBucket(bucket);
            }
          } catch (error) {
            req.log.error({ bucket: bucket }, 'could not create bucket');
            return res.status(500).json({ status: 'error', message: error.message}); 
          }
          const s3 = new AWS.S3(conf.s3);
          const key = Buffer.concat([Buffer.from(req.orgKey)], 32);
          const encrypt = crypto.createCipheriv(algorithm, key, iv);
          const pipe = req.pipe(encrypt);
          const params = {Bucket: bucket, Key: resourceName, Body: pipe};
          const upload = s3.upload( params );
          await upload.promise();

          data = `https://${conf.s3.endpoint}/${bucket}/${resourceName}`;
          location = 's3';
        } catch (error) {
          req.log.error( 'S3 upload error', error );
          return res.status(403).json({ status: 'error', message: error.message}); 
        }
      } else {
        data = await encryptResource(req);
        location = 'mongo';
      }

      await DeployableVersions.insertOne({
        'org_id': orgId,
        'channel_id': existingChannel.uuid,
        'channel_name': existingChannel.name,
        'name': version.name,
        'description': version.description,
        'uuid': version.uuid,
        'content':  data,
        'iv': ivText,
        'location': location,
        'type': version.type,
        'created': new Date()
      });
      
      const versionObj = {
        'uuid': version.uuid,
        'name': version.name,
        'description': version.description,
        'location': location
      };

      await Channels.updateOne(
        { org_id: orgId, uuid: existingChannel.uuid },
        { $push: { versions: versionObj } }
      );
      return res.status(200).json({ status: 'success', version: versionObj}); 
    } else {
      return res.status(404).json({ status: 'error', message: 'This channel was not found'}); 
    }
  } catch (error) {
    req.log.info( error.stack );
    return res.status(500).json({ status: 'error', message: error}); 
  }
}));

module.exports = router;
