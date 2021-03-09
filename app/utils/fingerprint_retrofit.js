
const _ = require('lodash');



const ObjectId = require('mongoose').Types.ObjectId;

const conf = require('../../conf.js').conf;
const S3ClientClass = require('../../s3/s3Client');
const url = require('url');
const { models } = require('../models');

const s3IsDefined = () => conf.s3.endpoint;

const s3Client = new S3ClientClass(conf);

const prepForS3 = (s3Link) => {
  const urlObj = new URL(s3Link);
  const fullPath = urlObj.pathname;
  return _.filter(_.split(fullPath, '/'));
}

const getS3Data = async (s3Link) => {
  try {
    const parts = prepForS3(s3Link);
    const bucketName = parts.shift();
    const path = `${parts.join('/')}`;
    await s3Client.ensureBucketExists(bucketName);
    const s3stream = s3Client.getObject(bucketName, path).createReadStream();
    return await readS3File(s3stream);
  } catch (error) {
    throw new Error(`Error retrieving data from s3 bucket. ${error.message}`);
  }
};

const readS3File = async (readable) => {
  readable.setEncoding('utf8');
  let data = '';
  for await (const chunk of readable) {
    data += chunk;
  }
  return data;
};

const resaveToCOS = async (content, orgKey, bucketName, path) => await s3Client.encryptAndUploadFile(bucketName, path, stream.Readable.from([content]), orgKey, crypto.randomBytes(16));

const updateResourceFromCOS = async (resource) => {
  const parts = prepForS3(o);
  const bucketName = parts.shift();
  const path = `${parts.join('/')}`;
  let yaml
  if (!resource) return null;

  if (resource.histId) {
    var resourceYamlHistObj = await models.ResourceYamlHist.findOne({ _id: resource.histId, org_id, resourceSelfLink: resource.selfLink }, {}, { lean: true });
    if (!resourceYamlHistObj) throw new Error(`hist _id ${histId} not found`);
    yaml = await getS3Data(resourceYamlHistObj.yamlStr, logger);
  } else {
    yaml = await getS3Data(resource.data, logger);
  }

  //## and do a save COS, 
  //## and save to db with the new fingerprint field. 
  //
  /// TODO: add fingerprint and orgkey somewhere in here
  await resaveToCOS(yaml, orgkey, bucketName, path)

  //## and maybe delete the old COS item if it exists
  await s3Client.deleteObject(bucketName, path);
  return resource;
}

if (!s3IsDefined) throw new Error('Define S3 endpoint please');

// db.resources.find({ fingerprint: { $exists: false } } ) . 
// pull them
const resources = models.Resource.find({ fingerprint: { $exists: false } });
if (!resources) throw new Error('no resources found.');

// run my encrypt func
const resourcesUpdated = await ryansMagicalScript();

// assuming whats returned is an array of resources that have been encrypted,
// update COS
if (resourcesUpdated) {
  resourcesUpdated.map(r => await updateResourceFromCOS(r))

  //and save to db with the new fingerprint field. 
  await models.Resources.updateOne({ _id: ObjectId(resources._id) });
}






