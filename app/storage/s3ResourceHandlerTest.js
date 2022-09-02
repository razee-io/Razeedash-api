'use strict';

/*
  Real test to manually test COS storage type

  Configure variables in .env file
    S3_LOCATIONS="WDC"
    S3_WDC_ENDPOINT
    S3_WDC_ACCESS_KEY_ID
    S3_WDC_SECRET_ACCESS_KEY
    S3_WDC_LOCATION_CONSTRAINT
  and then run this file:
    node -r dotenv/config app/storage/s3ResourceHandlerTest.js
*/

const storageFactory = require('./storageFactory');

async function test() {
  const orgKey = 'orgApiKey-63fe2b3a-8c07-45ee-9b34-8eb5ecf27edf';

  const resource = 'my awesome resource';
  const path = 'my-resource-name';
  const bucketName = 'my-bucket-223432r32e';
  const location = 'WDC';

  // Write resource into bucket
  const handler = storageFactory().newResourceHandler(path, bucketName, location);
  const ivText = await handler.setDataAndEncrypt(resource, orgKey);
  const encodedResource = handler.serialize();
  console.log(encodedResource, ivText);
  if (encodedResource.metadata.type !== 's3') throw new Error('Incorrect handler type');

  // Read resource from the bucket
  const getHandler = storageFactory().deserialize(encodedResource);
  const decryptedResource = await getHandler.getDataAndDecrypt(orgKey, ivText);
  console.log(decryptedResource);

  if (resource !== decryptedResource) throw new Error('Resources do not match');

  // Now delete the bucket
  const delHandler = storageFactory().deserialize(encodedResource);
  await delHandler.deleteData();
  const emptyEncodedResource = delHandler.serialize();

  // Delete the bucket again - should not throw exceptions
  const delHandlerToo = storageFactory().deserialize(encodedResource);
  await delHandlerToo.deleteData();

  const emptyHandler = storageFactory().deserialize(emptyEncodedResource);
  try {
    await emptyHandler.getDataAndDecrypt(orgKey, ivText);
    throw new Error('Should not reach this point');
  } catch (error) {
    console.log(error.message);
  }

  // Async write resource into bucket without encryption
  const longString = 'x'.repeat(10*1024*1024);
  const handler2 = storageFactory().newResourceHandler(path, bucketName, location);
  const promise = handler2.setData(longString);
  console.log('Waiting on promise...' + new Date());
  await promise;
  console.log('Promise settled ' + new Date());
  await handler2.deleteData();
  console.log('All done!');
}

test().catch(console.log);