'use strict';

/*
  Configure variables in .env file
    S3_WDC_ENDPOINT
    S3_WDC_ACCESS_KEY_ID
    S3_WDC_SECRET_ACCESS_KEY
    S3_WDC_LOCATION_CONSTRAINT
  and then run this file:
    node -r dotenv/config app/storage/legacyS3ResourceHandlerTest.js
*/

const conf = require('../conf').conf;
conf.storage.defaultHandler = 's3legacy'; // force legacy handler

const storageFactory = require('./storageFactory');

async function test() {
  const orgKey = 'orgApiKey-63fe2b3a-8c07-45ee-9b34-8eb5ecf27edf';

  const resource = 'my awesome resource';
  const path = 'my-resource-name';
  const bucketName = 'my-bucket-223432r32e';

  // Write resource into bucket
  const inHandler = storageFactory.newResourceHandler(path, bucketName);
  const ivText = await inHandler.setDataAndEncrypt(resource, orgKey);
  // Legacy handler instances are not supposed to be serialized
  const encodedResource = 'http://s3.us-east.cloud-object-storage.appdomain.cloud/my-bucket-223432r32e/my-resource-name'; // handler.serialize();

  const outHandler = storageFactory.deserialize(encodedResource);
  const decryptedResource = await outHandler.getDataAndDecrypt(orgKey, ivText);
  console.log(decryptedResource);
  if (resource !== decryptedResource) throw new Error('Resources do not match');

  // Reading existing legcy resource
  const existingS3LegacyResource = 'https://s3.us-east.cloud-object-storage.appdomain.cloud/cos-razee/d9ad5f7b-39f2-4794-aad2-1673d6770813-12e3f63d-2c6a-4fea-adb4-b57b1d65cc59-service-version-1';
  const oldHandler = storageFactory.deserialize(existingS3LegacyResource);
  const decryptedResourceThree = await oldHandler.getDataAndDecrypt(orgKey, 'kRcS5ISyObgiZ5WwbmQ3wg==');
  console.log(decryptedResourceThree);
  console.log(decryptedResourceThree.startsWith('apiVersion: v1'));
}

test().catch(console.log);