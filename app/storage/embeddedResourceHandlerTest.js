'use strict';

/*
  To run the test:
    node app/storage/embeddedResourceHandlerTest.js
*/

const storageFactory = require('./storageFactory');

async function test() {
  let resource = 'my awesome resource';
  const path = 'my-resource-name';
  const bucketName = 'my-bucket-223432r32e';
  const orgKey = 'orgApiKey-63fe2b3a-8c07-45ee-9b34-8eb5ecf27edf';
  const location = 'WDC';

  // Write resource into bucket
  const handler = storageFactory.newResourceHandler(path, bucketName, location);
  await handler.setDataAndEncrypt(resource, orgKey);
  const encodedResource = handler.serialize();
  console.log(encodedResource);

  // Read resource from the bucket
  const getHandler = storageFactory.deserialize(encodedResource);
  const decryptedResource = await getHandler.getDataAndDecrypt(orgKey);
  console.log(decryptedResource);

  if (resource !== decryptedResource) throw new Error('Resources do not match');

  // Now delete the bucket
  const delHandler = storageFactory.deserialize(encodedResource);
  await delHandler.deleteData();
  const emptyEncodedResource = delHandler.serialize();

  const emptyHandler = storageFactory.deserialize(emptyEncodedResource);
  try {
    await emptyHandler.getDataAndDecrypt(orgKey);
    throw new Error('Should not reach this point');
  } catch (error) {
    console.log(error.message);
  }
}

test().catch(console.log);