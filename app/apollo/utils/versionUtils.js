/**
 * Copyright 2022 IBM Corp. All Rights Reserved.
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

const storageFactory = require('../../storage/storageFactory');
const { getOrgKeyByUuid } = require('../../utils/orgs.js');
const { whoIs } = require ('../resolvers/common');
const conf = require('../../conf.js').conf;

const getDecryptedContent = async ( context, org, version ) => {
  const { me, req_id, logger } = context;
  const logContext = { req_id, user: whoIs(me), orgId: org.uuid, version: version.uuid, methodName: 'getDecryptedContent' };

  const handler = storageFactory(logger).deserialize(version.content);

  const retVal = {};

  try {
    retVal.encryptionOrgKeyUuid = version.desiredOrgKeyUuid || org.orgKeys[0];
    const orgKey = getOrgKeyByUuid( org, retVal.encryptionOrgKeyUuid );
    retVal.content = await handler.getDataAndDecrypt(orgKey.key, version.iv);
  }
  catch( decryptError1 ) {
    logger.info(logContext, `encountered an error when decrypting version '${version.uuid}' with desiredOrgKeyUuid for request ${req_id} (will try again with verifiedOrgKeyUuid): ${decryptError1.message}`);
    try {
      retVal.encryptionOrgKeyUuid = version.verifiedOrgKeyUuid || org.orgKeys[0];
      const orgKey = getOrgKeyByUuid( org, retVal.encryptionOrgKeyUuid );
      retVal.content = await handler.getDataAndDecrypt(orgKey.key, version.iv);
    }
    catch( decryptError2 ) {
      logContext.error = decryptError2.message;
      logger.error(logContext, `encountered an error when decrypting version '${version.uuid}' with verifiedOrgKeyUuid for request ${req_id}: ${decryptError2.message}`);
      throw decryptError2;
    }
  }

  return retVal;
};

const updateVersionKeys = async ( context, org, version, desiredOrgKeyUuid, verifiedOrgKeyUuid, newData ) => {
  const { models, me, req_id, logger } = context;
  const logContext = { req_id, user: whoIs(me), orgId: org.uuid, version: version.uuid, methodName: 'updateVersionKeys' };
  logger.info( logContext, `Entry, desiredOrgKeyUuid: ${desiredOrgKeyUuid}, verifiedOrgKeyUuid: ${verifiedOrgKeyUuid}` );

  if( desiredOrgKeyUuid ) {
    const retVal = await models.DeployableVersion.updateOne(
      {
        org_id: org._id,
        uuid: version.uuid,
        $and: [
          {$or: [ { verifiedOrgKeyUuid: { $exists: false } }, { verifiedOrgKeyUuid: version.verifiedOrgKeyUuid } ]},
          {$or: [ { desiredOrgKeyUuid: { $exists: false } }, { desiredOrgKeyUuid: version.desiredOrgKeyUuid } ]}
        ]
      },
      { $set: { verifiedOrgKeyUuid: verifiedOrgKeyUuid, desiredOrgKeyUuid: desiredOrgKeyUuid } }
    );
    return retVal;
  }
  else {
    const retVal = await models.DeployableVersion.updateOne(
      {
        org_id: org._id,
        uuid: version.uuid,
        $or: [ { verifiedOrgKeyUuid: { $exists: false } }, { verifiedOrgKeyUuid: version.verifiedOrgKeyUuid } ]
      },
      { $set: { verifiedOrgKeyUuid: verifiedOrgKeyUuid, content: newData.data } }
    );
    return retVal;
  }
};

/*
If storing for the first time, 'channel' must be provided so that data location can be determined.
If overwriting existing data, 'channel' is not used and data location, bucket, path etc are read from the 'version'.
*/
const encryptAndStore = async ( context, org, channel, version, orgKey, content ) => {
  const { me, req_id, logger } = context;
  const logContext = { req_id, user: whoIs(me), orgId: org.uuid, version: version.uuid, methodName: 'encryptAndStore' };

  /*
  More concise but fails linting:
  const path = version?.content?.data?.path || `${org._id.toLowerCase()}-${version.channel_id}-${version.uuid}`;
  const dataLocation = version?.content?.data?.location || channel?.data_location;
  const bucketName = version?.content?.data?.bucketName || conf.storage.getChannelBucket(dataLocation);
  */
  const path = (version.content && version.content.data && version.content.data.path) ? version.content.data.path : `${org._id.toLowerCase()}-${version.channel_id}-${version.uuid}`;
  const dataLocation = (version.content && version.content.data && version.content.data.location) ? version.content.data.location : (channel ? channel.data_location : null);
  const bucketName = (version.content && version.content.data && version.content.data.bucketName) ? version.content.data.bucketName : conf.storage.getChannelBucket(dataLocation);
  logger.info( logContext, `${(version.content && version.content.data) ? 'create object' : 'overwrite object'}, bucketName: ${bucketName}, path: ${path}` );

  const handler = storageFactory(logger).newResourceHandler(path, bucketName, dataLocation);
  await handler.setDataAndEncrypt(content, orgKey.key);
  logger.info( logContext, 'data stored successfully' );
  const data = handler.serialize();
  return( {data} );
};

/*
Update the Version to use the newOrgKey for encryption.
Each Version tracks which OrgKey is currently used for encryption (verifiedOrgKeyUuid) and which OrgKey it is being re-encrypted with (desiredOrgKeyUuid).
If execution is terminated during the re-encryption, one of these two will still be valid and ensures that decryption is always possible.

Return true if completely successful
Return false if:
  - Unable to update the Version record due to concurrent modification/deletion
  - Unable to re-encrypt and store the Version content
Throw error if:
  - Unable to decrypt current version content
  - Unable to communicate with the database to update the Version record
*/
const updateVersionEncryption = async (context, org, version, newOrgKey) => {
  const { me, req_id, logger } = context;
  const logContext = { req_id, user: whoIs(me), orgId: org.uuid, version: version.uuid, orgKey: newOrgKey.orgKeyUuid, methodName: 'updateVersionEncryption' };
  logger.info( logContext, 'Entry' );

  let encryptionOrgKeyUuid, content;
  try {
    const decryptResult = await getDecryptedContent( context, org, version );  // This func tries `desiredOrgKeyUuid` first, falls back to `verifiedOrgKeyUuid`, then fails if neither work.
    encryptionOrgKeyUuid = decryptResult.encryptionOrgKeyUuid;
    content = decryptResult.content;
  }
  catch( e ) {
    // It could not be retrieved or could not be decrypted, something has gone wrong!
    // E.g. someone/something force-deleting an OrgKey such that data encrypted with it cannot be retrieved.
    logContext.error = e.message;
    logger.error( logContext, 'Unable to retrieve existing Version content' );
    throw( e );
  }
  logger.info( logContext, `Version contents decrypted, encryptionOrgKeyUuid: ${encryptionOrgKeyUuid}` );

  if( version.desiredOrgKeyUuid != newOrgKey.orgKeyUuid || version.verifiedOrgKeyUuid != newOrgKey.orgKeyUuid ) {
    // Version is not using the new OrgKey as BOTH `verifiedOrgKeyUuid` and `desiredOrgKeyUuid`.
    // Either way, the Version needs to be updated to set working OrgKey as `verifiedOrgKeyUuid` and the new OrgKey as `desiredOrgKeyUuid`.
    try {
      const result = await updateVersionKeys( context, org, version, newOrgKey.orgKeyUuid, encryptionOrgKeyUuid );
      logger.info( logContext, `Version key update result: ${JSON.stringify(result)}` );
      if( result.nModified != 1 ) {
        // Version update did not occur because another process was updating the Version record in parallel (possibly even deleting it).
        // Re-encryption did not occur but the Version still has the OrgKey that is known to decrypt successfully in either `verifiedOrgKeyUuid` or `desiredOrgKeyUuid`
        // Additional future calls to this function will attempt to rectify this again, but Version content retrieval will continue to work in the mean time.
        logger.warn( logContext, `Simultaneous updates to Version '${version.uuid}' prevented updates to verifiedOrgKeyUuid and desiredOrgKeyUuid, unable to update encryption.` );
        return( false );
      }
    }
    catch( e ) {
      // Error communicating with database, throw
      logContext.error = e.message;
      logger.error( logContext, 'Error during database record update' );
      throw e;
    }
    logger.info( logContext, 'Version keys update started' );
    // After updating the Version record with `verifiedOrgKeyUuid` and `desiredOrgKeyUuid`, continue and re-encrypt with new OrgKey if needed.
  }

  if( encryptionOrgKeyUuid == newOrgKey.orgKeyUuid ) {
    // Version is already able to decrypt with the newOrgKey
    // Version uses newOrgKey as `verifiedOrgKeyUuid` (if not already set, was set above)
    // Version uses newOrgKey as `desiredOrgKeyUuid` (if not already set, was set above)
    // No re-encryption needed
    logger.info( logContext, 'Encryption is already up to date.' );
    return( true );
  }
  else {
    // Version is not able to decrypt with the newOrgKey (though the newOrgKey is now set as the `desiredOrgKeyUuid`, the _actual_ working OrgKey is set as `verifiedOrgKeyUuid`)
    // Re-encryption needed
    let newData;
    try {
      // For re-encryption, the Version contains all the data storage info needed (bucket name, data location, path for S3), so channel is passed as 'null'.
      newData = await encryptAndStore( context, org, null, version, newOrgKey, content );

      /*
      Dev Note:
      The Version's `content` is not changed by re-encryption, so `encryptAndStore` return value is not used.
      The `encryptAndStore` function name is a misnomer.  It uses `setDataAndEncrypt`, which uses `setDataAndEncrypt` on the appropriate storage handler.
      However the storage handler behavior is inconsistent:
        - embeddedResourceHandler does not actually *store/set* the data, it returns the data and relies on the calling function to persist the value into the database.
        - s3ResourceHandler *does* actually store the data into an S3 bucket before returning, and the return value from the function is only needed the first time the database record is written.
      I.e. when re-encrypting an embedded resource, the newData must be saved in updateVersionKeys below, but it does not need to be saved (the values wont change) when re-encrypting an S3 resource.
      */
    }
    catch( encryptErr ) {
      // Re-encryption did not occur but the Version still has the OrgKey that is known to decrypt successfully in `verifiedOrgKeyUuid`.
      // Additional future calls to this function will attempt to rectify this again, but Version content retrieval will continue to work in the mean time.
      return( false );
    }
    logger.info( logContext, 'Version content re-encrypted' );

    /*
    Before 'updateVersionEncryption' was introduced, the iv (initialization vector) would be stored separately from the encrypted data, in the db record.
    This is problematic for re-encryption as any data reads _between_ storing the re-encrypted data and storing the iv in the db record will use incorrect iv and result in garbled response (not an exception).
    If the code happens to _exit for any reason_ between storing the encrypted data and updating the db record (e.g. crash, pod eviction, etc), the iv is permanently lost and the data permanently garbled.
    Initial version creation doesn't have this problem only because it writes the encrypted data first and then creates the Version record with the iv -- the data cannot be read before the Version record is created.

    To address this problem and allow re-encrypting the data, all new encrypted data and re-encrypted data will store the iv along with the encrypted data.

    Alternative solutions considered include:
    - All new encryption / re-encryptionUse a different algorithm that doesn't rely on 'iv' text, such as 'AES'.  If unable to decrypt with old algorithm, fall back to 'AES'.
    - New data storage to actually *de*-encrypt and store plaintext.  If unable to decrypt with old algorithm, fall back to returning plaintext.
    */

    // After re-encrypting, update the Version to reflect the new `verifiedOrgKeyUuid`
    try {
      const result = await updateVersionKeys( context, org, version, null, newOrgKey.orgKeyUuid, newData );
      if( result.nModified != 1 ) {
        // Version update did not occur because another process was updating the Version record in parallel (possibly even deleting it).
        // Re-encryption using the newOrgKey DID occur here, the other process did the same (or is deleting the Version).
        // The other process already updated the Version's `verifiedOrgKeyUuid`, so the fact that this process could not update it can be ignored (especially if the Version is being deleted).
        // Log a warning, but continue.
        logger.warn( logContext, `Simultaneous updates to Version '${version.uuid}' prevented updates to verifiedOrgKeyUuid, continuing.` );
      }
      logger.info( logContext, 'Version keys update finished' );
    }
    catch( e ) {
      // Error communicating with database, throw
      logContext.error = e.message;
      logger.error( logContext, 'Error during database record update' );
      throw e;
    }

    // Version updates and re-encryption successful (or no-op)
    logger.info( logContext, 'Version updates and re-encryption successful (or no-op)' );
    return( true );
  }
};

module.exports = {
  getDecryptedContent,
  encryptAndStore,
  updateVersionEncryption,
};
