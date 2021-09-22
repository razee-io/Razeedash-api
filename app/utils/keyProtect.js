const _ = require('lodash');
const KeyProtectV2 = require('@ibm-cloud/ibm-key-protect/ibm-key-protect-api/v2');
const { IamAuthenticator } = require('@ibm-cloud/ibm-key-protect/auth');
const { createLogger } = require('../log');
const logger = createLogger('keyProtect');

const genKmsKey = async({ name, metroConf })=>{
  const authenticator = new IamAuthenticator({
    apikey: metroConf.kmsApiKey,
    url: metroConf.kmsIamAuthUrl,
  });
  const keyProtectClient = new KeyProtectV2({
    authenticator,
    serviceUrl: metroConf.kmsEndpoint,
  });
  const envConfig = {
    apiKey: metroConf.kmsApiKey,
    iamAuthUrl: metroConf.kmsIamAuthUrl,
    serviceUrl: metroConf.kmsEndpoint,
    bluemixInstance: metroConf.kmsBluemixInstanceGuid,
  };
  const body = {
    metadata: {
      collectionType: 'application/vnd.ibm.kms.key+json',
      collectionTotal: 1,
    },
    resources: [
      {
        type: 'application/vnd.ibm.kms.key+json',
        name: name,
        extractable: false,
      },
    ],
  };
  const result = await keyProtectClient.createKey({
    ...envConfig,
    body,
  });
  return result.result.resources[0].crn;
};

const rotateKey = async({ crn, metroConf })=>{
  if(!crn){
    throw new Error('crn is required for rotateKey()');
  }
  if(!metroConf){
    throw new Error('metroConf is required for rotateKey()');
  }
  const keyId = _.last(crn.split(':'));
  if(!keyId){
    throw new Error('unable to find kms key id in crn');
  }
  const authenticator = new IamAuthenticator({
    apikey: metroConf.kmsApiKey,
    url: metroConf.kmsIamAuthUrl,
  });
  const keyProtectClient = new KeyProtectV2({
    authenticator,
    serviceUrl: metroConf.kmsEndpoint,
  });
  const envConfig = {
    apiKey: metroConf.kmsApiKey,
    iamAuthUrl: metroConf.kmsIamAuthUrl,
    serviceUrl: metroConf.kmsEndpoint,
    bluemixInstance: metroConf.kmsBluemixInstanceGuid,
  };
  try{
    const result = await keyProtectClient.rotateKey({
      id: keyId,
      keyActionRotateBody: {},
      ...envConfig,
    });
    logger.info('rotateKey', { crn, keyId, status:result.status });
    if(result.status != 204){
      throw new Error(`unexpected statuscode ${result.status}`);
    }
    return true;
  }
  catch(err){
    if(err.status == 409){
      logger.info('rotateKey', { crn, keyId, status:err.status });
      // conflict means its already rotating, so we can return
      return true;
    }
    throw err;
  }
};

module.exports = {
  genKmsKey,
  rotateKey,
};
