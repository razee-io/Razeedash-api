/**
 * Copyright 2020, 2022 IBM Corp. All Rights Reserved.
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

const { ACTIONS, TYPES } = require('../models/const');
const { whoIs, validAuth, BasicRazeeError, RazeeValidationError, RazeeQueryError, NotFoundError, RazeeForbiddenError } = require ('./common');
const { v4: UUID } = require('uuid');

const { validateString } = require('../utils/directives');

const unsetPrimaryUnless = async (models, orgId, orgKeyUuid) => {
  const sets = {};
  sets['orgKeys2.$[elem].primary'] = false;
  return await models.Organization.updateOne( { _id: orgId }, { $set: sets }, { arrayFilters: [ { 'elem.orgKeyUuid': { $ne: orgKeyUuid } } ], multi: true } );
};

const organizationResolvers = {
  Query: {
    organizations: async (parent, args, context) => {
      const queryName = 'organizations';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, args, me: whoIs(me) }, `${queryName} enter`);
      return models.User.getOrgs(context);
    },

    orgKey: async (parent, { orgId, uuid, name }, context) => {
      const queryName = 'orgKey';
      const { me, req_id, logger } = context;
      logger.info({ req_id, user: whoIs(me), orgId, uuid }, `${queryName} enter`);

      const allOrgKeys = await organizationResolvers.Query.orgKeys( parent, { orgId }, context );

      const foundOrgKey = allOrgKeys.find( e => {
        return( e.uuid === uuid || e.name === name );
      } );

      if( !foundOrgKey ){
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} OrgKey not found: ${uuid}/${name}`);
        throw new NotFoundError( context.req.t( 'Could not find the organization key.' ), context );
      }

      return foundOrgKey;
    },

    orgKeys: async (parent, { orgId }, context) => {
      const queryName = 'orgKeys';
      const { models, me, req_id, logger } = context;
      logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.READ, TYPES.ORGANIZATION, queryName, context);
      logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} user has ORGANIZATION READ`);

      let userCanViewKeyValues = false;
      try {
        await validAuth(me, orgId, ACTIONS.READ, TYPES.ORGANIZATION, queryName, context);
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} user has MANAGE`);
        userCanViewKeyValues = true;
      }
      catch( e ) {
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} user does not have MANAGE`);
      }

      try {
        await validAuth(me, orgId, ACTIONS.ATTACH, TYPES.CLUSTER, queryName, context);
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} user has CLUSTER ATTACH`);
        userCanViewKeyValues = true;
      }
      catch( e ) {
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} user does not have CLUSTER ATTACH`);
      }

      try {
        await validAuth(me, orgId, ACTIONS.REGISTER, TYPES.CLUSTER, queryName, context);
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} user has CLUSTER REGISTER`);
        userCanViewKeyValues = true;
      }
      catch( e ) {
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} user does not have CLUSTER REGISTER`);
      }

      try {
        if( !process.env.ORGKEYMGMT_ENABLED ) throw new Error( 'disabled' );

        const org = await models.Organization.findById(orgId);
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} org retrieved`);
        //console.log( `org: ${JSON.stringify(org, null, 2)}` );

        const allOrgKeys = [];

        // Add legacy OrgKeys
        if( org.orgKeys ) {
          allOrgKeys.push(
            ...org.orgKeys.map( legacyOrgKey => {
              return {
                uuid: legacyOrgKey,
                name: legacyOrgKey.slice( legacyOrgKey.length - 12 ),  // last segment of legacy key, which is essentially a UUID prefixed by `orgApiKey-`
                primary: false,
                created: null,
                updated: null,
                key: userCanViewKeyValues ? legacyOrgKey : null // Technically the key value is the legacy OrgKey 'uuid', so it is not actually hidden from the user
              };
            } )
          );
          logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} legacy OrgKeys added: ${org.orgKeys.length}`);
        }

        // Add OrgKeys2
        allOrgKeys.push(
          ...org.orgKeys2.map( orgKey => {
            return {
              uuid: orgKey.orgKeyUuid,
              name: orgKey.name,
              primary: orgKey.primary,
              created: orgKey.created,
              updated: orgKey.updated,
              key: userCanViewKeyValues ? orgKey.key : null
            };
          } )
        );
        logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} OrgKeys2 added: ${org.orgKeys2.length}`);

        // Return the orgKeys
        return allOrgKeys;
      } catch (error) {
        // Note: if using an external auth plugin, it's organization schema must define the OrgKeys2 attribute else query will throw an error.

        if(error instanceof BasicRazeeError ){
          throw error;
        }

        logger.error({ req_id, user: whoIs(me), orgId, error }, `${queryName} error encountered`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    },
  },

  Mutation: {
    addOrgKey: async (parent, { orgId, name, primary }, context) => {
      const queryName = 'addOrgKey';
      const { models, me, req_id, logger } = context;
      logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.ORGANIZATION, queryName, context);
      logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} user is authorized`);

      validateString( 'orgId', orgId );
      validateString( 'name', name );

      try {
        if( !process.env.ORGKEYMGMT_ENABLED ) throw new Error( 'disabled' );

        const org = await models.Organization.findById(orgId);
        logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} org retrieved`);
        //console.log( `org: ${JSON.stringify(org, null, 2)}` );

        // Attempt to prevent name duplication
        if( org.orgKeys2 && org.orgKeys2.find( e => { return e.name === name; } ) ) {
          throw new RazeeValidationError(context.req.t('The provided name is already in use: {{name}}', {'name':name}), context);
        }
        logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} OrgKey '${name}' does not  already exist`);

        // Define the new OrgKey
        const newOrgKeyUuid = UUID();
        const newOrgKey = {
          orgKeyUuid: newOrgKeyUuid,
          name,
          primary,
          created: Date.now(),
          updated: Date.now(),
          key: UUID()
        };
        logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} new OrgKey initialized`);

        // Add the new OrgKey to the orgKeys2 attribute of the org, creating it if necessary
        const push = {
          orgKeys2: newOrgKey
        };
        const res = await models.Organization.updateOne( { _id: orgId }, { $push: push } );
        logger.info({ req_id, user: whoIs(me), orgId, name, primary, res }, `${queryName} new OrgKey saved`);

        // Try to ensure only one Primary by setting 'primary: false' on all other OrgKeys AFTER saving the new primary successfully
        if( primary === true ) {
          try {
            const res = await unsetPrimaryUnless( models, orgId, newOrgKeyUuid );
            logger.info({ req_id, user: whoIs(me), orgId, name, primary, res }, `${queryName} primary removed from all other OrgKeys`);
          }
          catch( error ) {
            // If an error occurs while removing Primary from other OrgKeys, it can be logged and ignored -- the actual creation of the new OrgKey did succeed before this point is reached.
            logger.error({ req_id, user: whoIs(me), orgId, name, primary, res, error: error.message }, `${queryName} error removing primary from other OrgKeys, continuing`);
          }
        }

        // Return the new orgKey uuid and key value
        return { uuid: newOrgKey.orgKeyUuid, key: newOrgKey.key };
      } catch (error) {
        // Note: if using an external auth plugin, it's organization schema must define the OrgKeys2 attribute else query will throw an error.

        if(error instanceof BasicRazeeError ){
          throw error;
        }

        logger.error({ req_id, user: whoIs(me), orgId, name, primary, error }, `${queryName} error encountered`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end createOrgKey

    removeOrgKey: async (parent, { orgId, uuid, forceDeletion }, context) => {
      const queryName = 'removeOrgKey';
      const { models, me, req_id, logger } = context;
      logger.info({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.ORGANIZATION, queryName, context);
      logger.info({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} user is authorized`);

      validateString( 'orgId', orgId );
      validateString( 'uuid', uuid );

      try {
        if( !process.env.ORGKEYMGMT_ENABLED ) throw new Error( 'disabled' );

        const org = await models.Organization.findById(orgId);
        logger.info({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} org retrieved`);

        // Ensure not removing a Primary OrgKey (set it to non-primary first), unless forced
        if( org.orgKeys2 ) {
          const thisOrgKey = org.orgKeys2.find( orgKey => {
            return( orgKey.orgKeyUuid == uuid );
          } );
          if( thisOrgKey && thisOrgKey.primary ) {
            // Forbidden
            logger.warn({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} OrgKey cannot be removed because it is in use (primary)` );
            if( !forceDeletion ) throw new RazeeForbiddenError( context.req.t( 'Organization key {{id}} cannot be removed or altered because it is in use.', {id: uuid} ), context );
          }
        }

        const allOrgKeys = [];

        // Add legacy OrgKeys
        if( org.orgKeys ) {
          allOrgKeys.push(
            ...org.orgKeys.map( legacyOrgKey => {
              return {
                uuid: legacyOrgKey,
                name: legacyOrgKey.slice( legacyOrgKey.length - 12 ),  // last segment of legacy key, which is essentially a UUID prefixed by `orgApiKey-`
                primary: false,
                created: null,
                updated: null,
                key: legacyOrgKey
              };
            } )
          );
          logger.info({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} legacy OrgKeys added: ${org.orgKeys.length}`);
        }

        // Add OrgKeys2
        allOrgKeys.push(
          ...org.orgKeys2.map( orgKey => {
            return {
              uuid: orgKey.orgKeyUuid,
              name: orgKey.name,
              primary: orgKey.primary,
              created: orgKey.created,
              updated: orgKey.updated,
              key: orgKey.key
            };
          } )
        );
        logger.info({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} OrgKeys2 added: ${org.orgKeys2.length}`);

        const foundOrgKey = allOrgKeys.find( e => {
          return( e.uuid === uuid );
        } );

        if( !foundOrgKey ){
          logger.info({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} OrgKey not found`);
          throw new NotFoundError( context.req.t( 'Could not find the organization key.' ), context );
        }

        // Ensure not removing the last OrgKey, unless forced
        if( allOrgKeys.length == 1 ) {
          // Forbidden
          logger.warn({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} OrgKey cannot be removed because it is in use (last one)` );
          if( !forceDeletion ) throw new RazeeForbiddenError( context.req.t( 'Organization key {{id}} cannot be removed or altered because it is in use.', {id: uuid} ), context );
        }

        // Ensure not removing an orgKey that was the last one used by at least one managed cluster, unless forced
        const clusterUsingOrgKey = await models.Cluster.findOne( {
          org_id: orgId,
          lastOrgKeyUuid: uuid,
        } ).lean({ virtuals: true });
        if( clusterUsingOrgKey ) {
          // Forbidden
          logger.warn({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} OrgKey cannot be removed because it is in use (cluster)` );
          if( !forceDeletion ) throw new RazeeForbiddenError( context.req.t( 'Organization key {{id}} cannot be removed or altered because it is in use.', {id: uuid} ), context );
        }

        // Remove the OrgKey from both orgKeys and orgKeys2
        const pull = {
          orgKeys: uuid,
          orgKeys2: { orgKeyUuid: uuid }
        };
        await models.Organization.updateOne( { _id: orgId }, { $pull: pull } );
        logger.info({ req_id, user: whoIs(me), orgId, uuid, forceDeletion }, `${queryName} OrgKey removed`);

        return { success: true };
      } catch (error) {
        // Note: if using an external auth plugin, it's organization schema must define the OrgKeys2 attribute else query will throw an error.

        if(error instanceof BasicRazeeError ){
          throw error;
        }

        logger.error({ req_id, user: whoIs(me), orgId, uuid, forceDeletion, error: error.message }, `${queryName} error encountered`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end removeOrgKey

    editOrgKey: async (parent, { orgId, uuid, name, primary }, context) => {
      const queryName = 'editOrgKey';
      const { models, me, req_id, logger } = context;
      logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.ORGANIZATION, queryName, context);
      logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} user is authorized`);

      validateString( 'orgId', orgId );
      validateString( 'uuid', uuid );
      if( name ) validateString( 'name', name );

      try {
        const org = await models.Organization.findById(orgId);
        logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} org retrieved`);

        // Check legacy OrgKeys (cannot be edited)
        if( org.orgKeys ) {
          const legacyOrgKey = org.orgKeys.find( e => { return( e === uuid ); } );
          if( legacyOrgKey ) {
            logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} Cannot edit legacy OrgKey: ${uuid}`);
            throw new RazeeForbiddenError( context.req.t( 'Organization key {{id}} cannot be altered, but it may be deleted.', {id: uuid} ), context );
          }
        }
        logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} OrgKey is not Legacy`);

        // Ensure OrgKey exists
        let orgKey = null;
        if( org.orgKeys2 ) {
          orgKey = org.orgKeys2.find( e => { return( e.orgKeyUuid === uuid ); } );
        }
        if( !orgKey ) {
          logger.info({ req_id, user: whoIs(me), orgId }, `${queryName} OrgKey not found: ${uuid}`);
          throw new NotFoundError( context.req.t( 'Could not find the organization key.' ), context );
        }
        logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} OrgKey is found`);

        // Ensure not unsetting last Primary OrgKey
        if( org.orgKeys2 ) {
          const primaryOrgKeys = org.orgKeys2.filter( orgKey => {
            return( orgKey.primary );
          } );
          if( orgKey.primary && primaryOrgKeys.length < 2 ) {
            // Forbidden
            logger.warn({ req_id, user: whoIs(me), orgId, uuid }, `${queryName} OrgKey cannot be altered because it is in use (primary)` );
            throw new RazeeForbiddenError( context.req.t( 'Organization key {{id}} cannot be removed or altered because it is in use.', {id: uuid} ), context );
          }
        }

        // Edit the OrgKey
        const sets = {};
        if( name ) {
          sets['orgKeys2.$.name'] = name;
        }
        if( primary === true || primary === false ) {
          sets['orgKeys2.$.primary'] = primary;
        }
        logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} Setting: ${JSON.stringify( sets, null, 2 )}`);
        const res = await models.Organization.updateOne( { _id: orgId, 'orgKeys2.orgKeyUuid': uuid }, { $set: sets } );
        logger.info({ req_id, user: whoIs(me), orgId, uuid, name, primary }, `${queryName} OrgKey updated`);

        // Try to ensure only one Primary by setting 'primary: false' on all other OrgKeys AFTER saving the new primary successfully
        if( primary === true ) {
          try {
            const res = await unsetPrimaryUnless( models, orgId, uuid );
            logger.info({ req_id, user: whoIs(me), orgId, name, primary, res }, `${queryName} primary removed from all other OrgKeys`);
          }
          catch( error ) {
            // If an error occurs while removing Primary from other OrgKeys, it can be logged and ignored -- the actual creation of the new OrgKey did succeed before this point is reached.
            logger.error({ req_id, user: whoIs(me), orgId, name, primary, res, error: error.message }, `${queryName} error removing primary from other OrgKeys, continuing`);
          }
        }

        return {
          modified: res.modifiedCount !== undefined ? res.modifiedCount : res.nModified
        };
      } catch (error) {
        // Note: if using an external auth plugin, it's organization schema must define the OrgKeys2 attribute else query will throw an error.

        if(error instanceof BasicRazeeError ){
          throw error;
        }

        logger.error({ req_id, user: whoIs(me), orgId, uuid, name, primary, error }, `${queryName} error encountered`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end editOrgKey

  },
};

module.exports = organizationResolvers;
