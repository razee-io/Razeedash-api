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
const { getOrgKeyByUuid, bestOrgKey } = require('../../utils/orgs');
const { whoIs, RazeeValidationError, BasicRazeeError } = require ('../resolvers/common');
const conf = require('../../conf.js').conf;
const { CHANNEL_VERSION_LIMITS, CHANNEL_CONSTANTS, MAX_REMOTE_PARAMETERS_LENGTH, CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB } = require('../models/const');
const { validateString } = require('./directives');
const yaml = require('js-yaml');
const streamToString = require('stream-to-string');

const getDecryptedContent = async ( context, org, version ) => {
  const { me, req_id, logger } = context;
  const logContext = { req_id, user: whoIs(me), orgId: org.uuid, version: version.uuid, methodName: 'getDecryptedContent' };

  const handler = storageFactory(logger).deserialize(version.content);

  const retVal = {};

  try {
    retVal.encryptionOrgKeyUuid = version.desiredOrgKeyUuid || org.orgKeys[0];
    const orgKey = getOrgKeyByUuid( org, retVal.encryptionOrgKeyUuid );
    retVal.content = await handler.getDataAndDecrypt(orgKey.key, version.iv);
    logger.info(logContext, `successfully decrypted version '${version.uuid}' with desiredOrgKeyUuid for request ${req_id}`);
  }
  catch( decryptError1 ) {
    try {
      retVal.encryptionOrgKeyUuid = version.verifiedOrgKeyUuid || org.orgKeys[0];
      const orgKey = getOrgKeyByUuid( org, retVal.encryptionOrgKeyUuid );
      retVal.content = await handler.getDataAndDecrypt(orgKey.key, version.iv);
      logger.info(logContext, `successfully decrypted version '${version.uuid}' with verifiedOrgKeyUuid for request ${req_id}`);
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
  logger.info( logContext, `Entry, desiredOrgKeyUuid: ${desiredOrgKeyUuid}, verifiedOrgKeyUuid: ${verifiedOrgKeyUuid}, org._id: ${org._id}, version: ${version.uuid}` );

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
        uuid: version.uuid
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

  const handler = storageFactory(logger).newResourceHandler(path, bucketName, dataLocation);
  await handler.setDataAndEncrypt(content, orgKey.key);
  logger.info( logContext, `${(version.content && version.content.data) ? 'created object' : 'overwrote object'}, bucketName: ${bucketName}, path: ${path}` );
  const data = handler.serialize();
  return( {data} );
};

// Keep track of which orgs are updating version encryption to avoid repeated re-encryption.
// This also serves to throttle repeated calls that could cause excess load by repeatedly re-encrypting.
const orgsUpdatingVersionEncryption = {};

/*
Update all Versions to use the newOrgKey for encryption.
Each Version tracks which OrgKey is currently used for encryption (verifiedOrgKeyUuid) and which OrgKey it is being re-encrypted with (desiredOrgKeyUuid).
If execution is terminated during the re-encryption, one of these two will still be valid and ensures that decryption is always possible.

Return object indicating how many Versions were successfully re-encrypted, how many failed to re-encrypt, and how many were not attempted.
*/
const updateAllVersionEncryption = async (context, org, versions, newOrgKey) => {
  const retVal = { successful: 0, failed: 0, incomplete: versions.length };

  const updatingOrgKey = orgsUpdatingVersionEncryption[ org._id ];
  if( updatingOrgKey == newOrgKey.orgKeyUuid ) {
    // Updating the encryption to use the newOrgKey is already in process.
    throw new Error( 'already in progress' );
  }
  orgsUpdatingVersionEncryption[ org._id ] = newOrgKey.orgKeyUuid;

  for( const v of versions ) {
    try {
      const result = await updateVersionEncryption( context, org, v, newOrgKey);
      if( result ) {
        // This version reencrypted successfully (or no-op), continue
        retVal.successful++;
        retVal.incomplete--;
      }
      else {
        // Version re-encryption should halt now!
        return( retVal );
      }
    }
    catch( e ) {
      // This Version did not re-encrypte successfully due to an error (e.g. unable to communicate with the database or unable to decrypt existing data)
      // Re-encryption can continue.
      retVal.failed++;
      retVal.incomplete--;
    }
  }
  delete orgsUpdatingVersionEncryption[ org._id ];
  return( retVal );
};

/*
Return true if Version re-encryption succeeded and re-encryption should continue.
Return false if Version re-encryption should halt and re-encryption of this Version was not attempted.
Throw an error if unable to re-encrypt.  Re-encryption should continue however.
*/
const updateVersionEncryption = async (context, org, version, newOrgKey) => {
  const { me, req_id, logger, models } = context;
  const logContext = { req_id, user: whoIs(me), orgId: org.uuid, version: version.uuid, orgKey: newOrgKey.orgKeyUuid, methodName: 'updateVersionEncryption' };
  logger.info( logContext, 'Entry' );

  // Re-retrieve the Org from the DB
  try {
    org = await models.Organization.findById(org._id);
    const currentBestOrgKey = bestOrgKey( org );
    if( currentBestOrgKey.orgKeyUuid != newOrgKey.orgKeyUuid ) {
      // If the newOrgKey is no longer the best OrgKey, abort.
      // This could occur if another OrgKey is created before re-encryption finishes.
      logger.info( logContext, 'Best OrgKey has changed.  Aborting.' );
      return false;
    }
  }
  catch( e ) {
    // If unable to determine if the newOrgKey is still the best OrgKey, abort.
    logContext.error = e.message;
    logger.error( logContext, 'Error while confirming best OrgKey.  Aborting.' );
    return false;
  }

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
  logger.info( logContext, `Existing Version contents decrypted successfully, encryption OrgKey: ${encryptionOrgKeyUuid}` );

  if( version.desiredOrgKeyUuid != newOrgKey.orgKeyUuid || version.verifiedOrgKeyUuid != newOrgKey.orgKeyUuid ) {
    // Version is not using the new OrgKey as BOTH `verifiedOrgKeyUuid` and `desiredOrgKeyUuid`.
    // Either way, the Version needs to be updated to set working OrgKey as `verifiedOrgKeyUuid` and the new OrgKey as `desiredOrgKeyUuid`.
    try {
      const result = await updateVersionKeys( context, org, version, newOrgKey.orgKeyUuid, encryptionOrgKeyUuid );
      logger.info( logContext, `Version key update result: ${JSON.stringify(result)}` );
      if( result.matchedCount != 1 ) {
        // Version update did not occur because another process was updating the Version record in parallel (changing used keys or deleting it).
        // Re-encryption did not occur but the Version still has the OrgKey that is known to decrypt successfully in either `verifiedOrgKeyUuid` or `desiredOrgKeyUuid`.
        // Additional future calls to this function can attempt re-encryption, and Version content retrieval will continue to work.
        logger.warn( logContext, `Simultaneous updates to Version '${version.uuid}' detected, unable to update encryption safely.  Continuing.` );
        return( true );
      }
    }
    catch( e ) {
      // Error communicating with database, throw
      logContext.error = e.message;
      logger.error( logContext, 'Error ocurred while updating Version keys.  Continuing.' );
      throw e;
    }
    logger.info( logContext, 'Version keys update started, re-encrypting content next...' );
    // After updating the Version record with `verifiedOrgKeyUuid` and `desiredOrgKeyUuid`, continue and re-encrypt with new OrgKey if needed.
  }

  if( encryptionOrgKeyUuid == newOrgKey.orgKeyUuid ) {
    // Version is already able to decrypt with the newOrgKey
    // Version uses newOrgKey as `verifiedOrgKeyUuid` (if not already set, was set above)
    // Version uses newOrgKey as `desiredOrgKeyUuid` (if not already set, was set above)
    // No re-encryption needed
    logger.info( logContext, 'Encryption is already up to date.  Continuing.' );
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
      The `encryptAndStore` function name is a misnomer.  It uses `setDataAndEncrypt` on the appropriate storage handler.
      However the storage handler behavior is inconsistent:
        - embeddedResourceHandler does not actually *store/set* the data, it returns the new data and relies on the calling function to persist the value into the database in the Version's `content` attribute.
        - s3ResourceHandler *does* actually store the data into an S3 bucket before returning, and the return value from the function is only needed the first time the database record is written (it does not change on re-encryption).
      I.e. when re-encrypting an embedded resource, the newData must be saved in updateVersionKeys below, but it does not need to be saved (the values wont change) when re-encrypting an S3 resource.
      */
    }
    catch( e ) {
      // Re-encryption did not occur (e.g. error writing to S3) but the Version still has the OrgKey that is known to decrypt successfully in `verifiedOrgKeyUuid`.
      // Additional future calls to this function will attempt to rectify this again, but Version content retrieval will continue to work in the mean time.
      logContext.error = e.message;
      logger.error( logContext, 'Error during data re-encryption.  Continuing.' );
      throw e;
    }
    logger.info( logContext, 'Version content re-encrypted successfully, updating version keys next...' );

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
      if( result.matchedCount != 1 ) {
        // Version update did not occur because another process deleted it in parallel.
        logger.warn( logContext, `Version '${version.uuid}' no longer exists when attempting final key update.` );
      }
    }
    catch( e ) {
      // Error communicating with database, throw
      logContext.error = e.message;
      logger.error( logContext, 'Error during final Version key update.  Continuing.' );
      throw e;
    }

    // Version updates and re-encryption successful (or no-op)
    logger.info( logContext, 'Version key updates and re-encryption successful (or no-op).  Continuing.' );
    return( true );
  }
};

const validateNewVersions = async ( org_id, { channel, newVersions }, context ) => {
  // If no new versions to validate, just return
  if( !newVersions || newVersions.length == 0 ) return;

  const { models } = context;
  const total = await models.DeployableVersion.count( { org_id, channel_id: channel.uuid } );
  if( total+newVersions.length > CHANNEL_VERSION_LIMITS.MAX_TOTAL ) {
    throw new RazeeValidationError( context.req.t( 'Too many configuration channel versions are registered under {{channel_uuid}}.', { 'channel_uuid': channel.uuid } ), context );
  }

  // Get existing and new version names to use later when checking for duplicates
  const existingVersionNames = channel.versions.map( cv => cv.name );
  const newVersionNames = newVersions.map( nv => nv.name );

  for( const v of newVersions ) {
    validateString( 'name', v.name );
    validateString( 'type', v.type );
    if( v.content ) validateString( 'content', v.content );

    if( !v.name ) throw new RazeeValidationError( context.req.t( 'Versions must specify a "name".' ), context);

    // Prevent duplicate names
    if( existingVersionNames.indexOf( v.name ) >= 0 || newVersionNames.filter( n => n === v.name ).length > 1 ) {
      throw new RazeeValidationError( context.req.t( 'The version name "{{name}}" cannot be used more than once.', { 'name': v.name } ), context );
    }

    // Validate type is yaml
    if( !v.type || v.type !== 'yaml' && v.type !== 'application/yaml' ) {
      throw new RazeeValidationError( context.req.t( 'Versions must specify a "type" of "application/yaml".' ), context );
    }

    // Validate UPLOADED-specific values
    if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
      // Normalize
      delete v.remote;

      if(!v.file && !v.content){
        throw new RazeeValidationError( context.req.t( 'Uploaded versions must specify a "file" or "content".' ), context );
      }
    } // end UPLOADED validation
    // Validate REMOTE-specific values
    else if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
      // Normalize
      delete v.content;
      delete v.file;

      // Validate remote
      if( !v.remote ) {
        throw new RazeeValidationError( context.req.t( 'Remote version source details must be provided.' ), context );
      }

      // Normalize (ensure no extra attributes)
      v.remote = { parameters: v.remote.parameters };

      // Validate remote.parameters (length)
      if( v.remote.parameters && JSON.stringify(v.remote.parameters).length > MAX_REMOTE_PARAMETERS_LENGTH ) {
        throw new RazeeValidationError( context.req.t( 'The remote version parameters are too large.  The string representation must be less than {{MAX_REMOTE_PARAMETERS_LENGTH}} characters long', { MAX_REMOTE_PARAMETERS_LENGTH } ), context );
      }
    } // end REMOTE validation
  }
};

// Load the content from file, content string, or remote and update the version object.
const ingestVersionContent = async ( org_id, { org, channel, version, file, content, remote }, context ) => {
  // If content is UPLOADED, get the content, encrypt and store, and add the results to the Version object
  if( !channel.contentType || channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.UPLOADED ) {
    try {
      if( file ){
        const tempFileStream = ( await file ).createReadStream();
        content = await streamToString( tempFileStream );
      }
      let yamlSize = Buffer.byteLength( content );
      if( yamlSize > CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB * 1024 * 1024 ){
        throw new RazeeValidationError( context.req.t( 'YAML file size should not be more than {{CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB}}mb', { 'CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB': CHANNEL_VERSION_YAML_MAX_SIZE_LIMIT_MB } ), context );
      }

      yaml.safeLoadAll( content );
    } catch (error) {
      if (error instanceof BasicRazeeError) {
        throw error;
      }
      throw new RazeeValidationError( context.req.t( 'Provided YAML content is not valid: {{error}}', { 'error': error } ), context );
    }

    const orgKey = bestOrgKey( org );
    const { data } = await encryptAndStore( context, org, channel, version, orgKey, content );

    // Note: if failure occurs after this point, the data may already have been stored by storageFactory even if the Version document doesnt get saved

    version.content = data;
    delete version.file;
    version.verifiedOrgKeyUuid = orgKey.orgKeyUuid;
    version.desiredOrgKeyUuid = orgKey.orgKeyUuid;
  }
  else if( channel.contentType === CHANNEL_CONSTANTS.CONTENTTYPES.REMOTE ) {
    version.content = {
      metadata: {
        type: 'remote',
      },
      remote: remote,
    };
    delete version.remote;
  }
};

module.exports = {
  getDecryptedContent,
  encryptAndStore,
  updateAllVersionEncryption,
  validateNewVersions,
  ingestVersionContent,
};
