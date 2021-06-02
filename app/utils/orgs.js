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

const _ = require('lodash');
const tokenCrypt = require('./crypt.js');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const delay = require('delay');
const pLimit = require('p-limit');
const Url = require('url');
const conf = require('../conf.js').conf;

const getOrg = async(req, res, next) => {
  const orgKey = req.orgKey;
  if (!orgKey) {
    req.log.info( 'Missing razee-org-key' );
    res.status(401).send( 'razee-org-key required' );
    return;
  }

  const Orgs = req.db.collection('orgs');
  const org = await Orgs.findOne({ orgKeys: orgKey });
  if (!org) {
    res.status(403).send( `orgKey ${orgKey} not found` );
    return;
  }
  req.org = org; // eslint-disable-line require-atomic-updates
  next();
};


const verifyAdminOrgKey = async(req, res, next) => {
  const receivedAdminKey = req.get('org-admin-key');
  if(!receivedAdminKey) {
    req.log.warn(`org-admin-key not specified on route ${req.url}`);
    return res.status(400).send( 'org-admin-key required' );
  }

  const storedAdminKey = process.env.ORG_ADMIN_KEY;
  if(!storedAdminKey) {
    req.log.warn('ORG_ADMIN_KEY env variable was not found');
    return res.status(400).send( 'missing ORG_ADMIN_KEY environment variable' );
  }

  if(receivedAdminKey !== storedAdminKey) {
    req.log.warn(`invalid org-admin-key supplied on route ${req.url}`);
    return res.status(401).send( 'invalid org-admin-key' );
  }
  next();
};

const encryptOrgData = (orgKey, data) => {
  if (!_.isString(data)) {
    data = JSON.stringify(data);
  }
  return tokenCrypt.encrypt(data, orgKey);
};

const decryptOrgData = (orgKey, data) => {
  return tokenCrypt.decrypt(data, orgKey);
};


const encryptStrUsingOrgEncKey = ({ str, org })=>{
  if((org.encKeys||[]).length < 1){
    return { data: str }; // lazy feature flag for now
  }
  // finds the first non-deleted key in org.encKeys
  var encKey = _.find(org.encKeys||[], (encKey)=>{
    return !encKey.deleted;
  });
  if(!encKey){
    throw new Error('no encKey found');
  }

  var encKeyId = encKey.id;
  var data = tokenCrypt.encrypt(str, encKey.key);
  return { encKeyId, data };
};

const decryptStrUsingOrgEncKey = ({ data, encKeyId, org })=>{
  if(!data || !encKeyId || !org){
    throw new Error('needs { data, encKeyId, org } properties');
  }
  var encKey = _.find(org.encKeys||[], (e)=>{
    return (e.id == encKeyId);
  });
  if(!encKey){
    throw new Error('no matching encKey found');
  }
  return tokenCrypt.decrypt(data, encKey.key);
};

var genKey = ()=>{
  var bytes = 32;
  var randBuff = crypto.randomBytes(bytes);
  if(!randBuff[0]){
    randBuff[0] = _.random(1, 255);
  }
  if(!randBuff[bytes - 1]){
    randBuff[bytes - 1] = _.random(1, 255);
  }
  var key = randBuff.toString('base64');
  var id = uuid();
  var creationTime = new Date();
  var deleted = false;
  return {
    id, key, creationTime, deleted,
  };
};

const pullFromS3 = async({ s3, url })=>{
  const parts = Url.parse(url);
  const paths = parts.path.split('/');
  const bucket = paths[1];
  const resourceName = paths.length > 3 ? paths[2] + '/' + paths[3] : paths[2];
  return await s3.getObjectAsStr(bucket, resourceName);
};

const pushToS3 = async (s3, key, searchableDataHash, dataStr) => {
  //if its a new or changed resource, write the data out to an S3 object
  const bucket = conf.s3.resourceBucket;
  const hash = crypto.createHash('sha256');
  const keyHash = hash.update(JSON.stringify(key)).digest('hex');
  await s3.createBucketAndObject(bucket, `${keyHash}/${searchableDataHash}`, dataStr);
  return `https://${s3.endpoint}/${bucket}/${keyHash}/${searchableDataHash}`;
};

var cronRotateEncKeys = async({ db, logger, maxAge=1000*60*60*24*365/2 })=>{
  var now = Date.now();
  var orgsToAddEncKeys= await db.collection('orgs').find({
    $or: [
      {
        // when encKeys doesnt exist
        encKeys: { $exists: false }
      },
      {
        // when encKeys is blank
        encKeys: { $size: 0 }
      },
      {
        // when all encKeys are deleted:true
        encKeys: {
          $not: {
            $elemMatch:{
              deleted: {
                $ne: true,
              }
            }
          }
        }
      }
    ]
  }).toArray();
  var orgsToDeleteEncKeys = await db.collection('orgs').find({
    $or: [
      {
        // encKeys that are expired but not yet deleted
        encKeys: {
          $elemMatch: {
            creationTime: { $lt: new Date(now - maxAge) },
            deleted: false,
          },
        },
      },
    ],
  }).toArray();

  var buildAddEncKeyOpForOrg = ({ org })=>{
    if(!org._id){
      throw new Error('missing org._id');
    }
    logger.info(`adding encKey for org id "${org._id}"`);
    return {
      updateOne: {
        filter: {
          _id: org._id,
        },
        update: {
          $push: {
            encKeys: genKey(),
          },
        },
      }
    };
  };

  var buildRemoveEncKeyOpForOrg = ({ org, encKeysToRemove })=>{
    var encKeysToRemoveIds = _.map(encKeysToRemove, 'id');
    logger.info(`marking encKeys ${JSON.stringify(encKeysToRemoveIds)} as deleted:true for org id "${org._id}"`);
    return {
      updateOne: {
        filter: {
          _id: org._id,
        },
        arrayFilters: [
          {
            'elem.id': { $in: encKeysToRemoveIds },
          },
        ],
        update: {
          $set:{
            'encKeys.$[elem].deleted': true,
          },
        },
      },
    };
  };

  var ops = [];
  // adds encKeys
  for(let org of orgsToAddEncKeys){
    ops.push(buildAddEncKeyOpForOrg({ org }));
  }
  // removes encKeys
  for(let org of orgsToDeleteEncKeys){
    // finds which encKeys to remove
    var encKeysToRemove = _.filter(org.encKeys||[], (encKey)=>{
      return (!encKey.deleted && encKey.creationTime < now - maxAge);
    });
    if(encKeysToRemove.length < 1){
      continue;
    }
    var encKeysToRemoveIds = _.map(encKeysToRemove, 'id');
    // finds keys that are not yet deleted and also wont be deleted in this call
    var undeletedEncKeyIds = _.filter(org.encKeys, (encKey)=>{
      return (!encKey.deleted && !_.includes(encKeysToRemoveIds, encKey.id));
    });
    if(undeletedEncKeyIds.length < 1){
      // if we're deleting all keys, then adds a new one to rotate to
      ops.push(buildAddEncKeyOpForOrg({ org }));
    }
    // marks old keys as deleted
    ops.push(buildRemoveEncKeyOpForOrg({ org, encKeysToRemove }));
  }
  // processes all ops
  if(ops.length < 1){
    return true;
  }
  await db.collection('orgs').bulkWrite(ops, { ordered: true });
};

var migrateResourcesToNewOrgKeysCron = async({ db, s3, logger })=>{
  if(migrateResourcesToNewOrgKeysCron.isRunning){
    logger.info('migrateResourcesToNewOrgKeysCron is already running');
    return;
  }
  migrateResourcesToNewOrgKeysCron.isRunning = true;
  logger.info('starting migrateResourcesToNewOrgKeysCron');

  var startTime = Date.now();

  try{
    for(var a=0;a<1000;a+=1){
      if(Date.now() > startTime + 45 * 60 * 1000){
        // if we've been running for 45mins, then breaks
        break;
      }

      // takes a short break between loops
      await delay(100);

      // finds an org with a delete:true encKey
      var org = await db.collection('orgs').findOne({
        encKeys:{
          $elemMatch: {
            deleted: true,
          },
        }
      });

      // if no org found, we have nothing left to do
      if(!org){
        logger.info('no orgs left containing an encKey with deleted=true');
        break;
      }

      // find an encKey where deleted:true
      var oldEncKey = _.find(org.encKeys||[], (encKey)=>{
        return encKey.deleted;
      });

      // finds the newest encKey
      var newEncKeys = _.filter(org.encKeys||[], (encKey)=>{
        return encKey.deleted;
      });
      var newEncKey = _.first(_.sortBy(newEncKeys, (e)=>{
        return -1 * e.creationTime;
      }));

      // checks for missing keys
      if(!newEncKey){
        throw new Error('no new encKey found');
      }
      if(!oldEncKey.id || !newEncKey.id){
        throw new Error('oldEncKey or newEncKey doesnt have a .id');
      }

      // loads all resources created with the oldEncKey
      var resources = await db.collection('resources').find(
        { encKeyId: oldEncKey.id, deleted: false },
        { limit: 100 }
      ).toArray();

      // if no resources with oldEncKey, we can remove oldEncKey
      if(resources.length < 1){
        await db.collection('orgs').updateOne(
          { _id: org._id },
          { $pull: { encKeys: { id: oldEncKey.id } } }
        );
        continue;
      }

      // updates all resources
      var limit = pLimit(10);
      await Promise.all(resources.map(async(resource)=>{
        return limit(async()=>{
          var oldContentEncrypted = resource.data;

          var isInS3 = !!s3;
          var isEncrypted = !!resource.encKeyId;

          // pulls from s3 if necessary
          if (isInS3) {
            try {
              oldContentEncrypted = await pullFromS3({
                s3,
                url: oldContentEncrypted,
              });
            }
            catch(err){
              // if it fails, it probably wasnt in s3. so uses the original data.
              // we need to do nothing here
            }
          }

          var content = oldContentEncrypted;

          // decrypts (if encrypted)
          if(isEncrypted){
            content = await decryptStrUsingOrgEncKey({
              data: oldContentEncrypted,
              encKeyId: resource.encKeyId,
              org,
            });
          }

          // encrypts with new key
          var result = encryptStrUsingOrgEncKey({ str: content, org });
          var encKeyId = result.encKeyId;
          var contentEncrypted = result.data;

          // uploads to s3 if necessary
          if(isInS3){
            var key = {
              org_id: org._id,
              cluster_id: resource.cluster_id,
              selfLink: resource.selfLink,
            };
            contentEncrypted = await pushToS3(s3, key, resource.searchableDataHash, contentEncrypted);
          }

          await db.collection('resources').updateOne(
            { _id: resource._id },
            {
              $set: {
                encKeyId,
                data: contentEncrypted,
              }
            }
          );
        });
      }));
    }
  }catch(err){
    logger.error('err in migrateResourcesToNewOrgKeysCron', err);
  }
  migrateResourcesToNewOrgKeysCron.isRunning = false;
  logger.info('exiting migrateResourcesToNewOrgKeysCron');
};
migrateResourcesToNewOrgKeysCron.isRunning = false;

// setTimeout(async()=>{
//   var getDb = async()=>{
//     const MongoClientClass = require('../mongo/mongoClient.js');
//
//     const MongoClient = new MongoClientClass(conf);
//     return await MongoClient.getClient({});
//   };
//   var getS3 = async()=>{
//     const S3ClientClass = require('../s3/s3Client');
//     return new S3ClientClass(require('../conf.js').conf);
//   };
//   var db = await getDb();
//   var s3 = await getS3();
//   // await cronRotateEncKeys({ db, maxAge:1000 })
//   await migrateResourcesToNewOrgKeysCron({ db, s3 });
// },1)

module.exports = {
  getOrg, verifyAdminOrgKey, encryptOrgData, decryptOrgData, encryptStrUsingOrgEncKey, decryptStrUsingOrgEncKey, genKey,
  cronRotateEncKeys, migrateResourcesToNewOrgKeysCron,
};
