
const _ = require('lodash');
const crypto = require('crypto');
const stream = require('stream');
const axios = require('axios');
const bunyan = require('bunyan');

const { getBunyanConfig } = require('./bunyan');
const { encryptStrUsingOrgEncKey } = require('./orgs');
const conf = require('../../conf.js').conf;
const S3ClientClass = require('../../s3/s3Client');
const { models } = require('../models');

const logger = bunyan.createLogger(getBunyanConfig('razeedash-api'));


const s3IsDefined = () => conf.s3.endpoint;

const s3Client = new S3ClientClass(conf);


const generateEncKeyFromGQL = async variables =>
  axios.post(
    process.env.GRAPHQL_URL,
    {
      query: `
          createOrgEncKey($orgId: String) {
            signUp(
              orgId: $orgId
            ) {
              fingerprint
              creationTime
            }
          }
        `,
      variables
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.TOKEN}`
      },
    },
  );


const prepForS3 = (s3Link) => {
  const urlObj = new URL(s3Link);
  const fullPath = urlObj.pathname;
  return _.filter(_.split(fullPath, '/'));
};

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

const updateResourceFromCOS = async (org, resource) => {
  const parts = prepForS3(resource);
  const bucketName = parts.shift();
  const path = `${parts.join('/')}`;
  let str;
  if (!resource) return null;

  if (resource.histId) {
    var resourceYamlHistObj = await models.ResourceYamlHist.findOne({ _id: resource.histId, org_id: org._id, resourceSelfLink: resource.selfLink }, {}, { lean: true });
    if (!resourceYamlHistObj) throw new Error(`hist _id ${resource.histId} not found`);
    str = await getS3Data(resourceYamlHistObj.yamlStr, logger);
  } else {
    str = await getS3Data(resource.data, logger);
  }

  // run my encrypt func
  const { encKeyId, data } = await encryptStrUsingOrgEncKey({ str, org });

  //## and do a save COS, 
  //## and save to db with the new fingerprint field. 
  //
  await resaveToCOS(data, encKeyId, bucketName, path);

  //## and maybe delete the old COS item if it exists
  //await s3Client.deleteObject(bucketName, path);
  return encKeyId;
};






if (!s3IsDefined) throw new Error('Define S3 endpoint please');
if (!process.env.GRAPHQL_URL) throw new Error('Need a graphql url defined: process.env.GRAPHQL_URL');
if (!process.env.TOKEN) throw new Error('Need a graphql url defined: process.env.TOKEN');


// grab an org
logger.info('Grabbiing an org');
const org = models.Organization.findOne();

// db.resources.find({ fingerprint: { $exists: false } } )  && pull them
logger.info('find resources');
const resources = models.Resource.find({ org_id: org._id, fingerprint: { $exists: false } }, { $limit: 1000 });
if (!resources) throw new Error(`no resources found for ${org.name}`);


// run the createOrgEncKey graphql endpoint on your org. 
const didGenKeys = generateEncKeyFromGQL({ org_id: org._id });

// then add a enableResourceEncryption:true attribute to your org in the db.
if (didGenKeys) {
  models.Organization.updateOne({ _id: org._id }, {
    $push: { enableResourceEncryption: true },
  });
  resources.map(r => {
    const encKeyId = updateResourceFromCOS(org, r);
    models.Resources.updateOne({ _id: r._id }, {
      $push: { encKeyId },
    });
  });

} else {
  throw new Error(`Org encription keys di not generate for ${org.name}`);
}
