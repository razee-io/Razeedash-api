/**
 * Copyright 2020 IBM Corp. All Rights Reserved.
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
const { whoIs, validAuth, BasicRazeeError, RazeeValidationError, RazeeQueryError } = require ('./common');
const { v4: UUID } = require('uuid');

const organizationResolvers = {
  Query: {

    organizations: async (parent, args, context) => {
      const queryName = 'organizations';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, args, me: whoIs(me) }, `${queryName} enter`);
      return models.User.getOrgs(context);
    },
  },

  Mutation: {
    addOrgKey: async (parent, { orgId, name, primary }, context) => {
      const queryName = 'addOrgKey';
      const { models, me, req_id, logger } = context;
      logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} enter`);

      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.ORGANIZATION, queryName, context);
      logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} user is authorized`);

      try {
        const org = await models.Organization.findById(orgId);
        logger.info({ req_id, user: whoIs(me), orgId, name, primary }, `${queryName} org retrieved`);
        console.log( `org: ${JSON.stringify(org, null, 2)}` );

        // Attempt to prevent name duplication
        if( org.orgKeys && org.orgKeys2.find( e => { return e.name === name; } ) ) {
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

        // Return the new orgKey uuid and key value
        return { uuid: newOrgKey.orgKeyUuid, key: newOrgKey.key };
      } catch (error) {
        if(error instanceof BasicRazeeError ){
          throw error;
        }

        logger.error({ req_id, user: whoIs(me), orgId, error }, `${queryName} error encountered`);
        throw new RazeeQueryError(context.req.t('Query {{queryName}} error. {{error.message}}', {'queryName':queryName, 'error.message':error.message}), context);
      }
    }, // end createOrgKey
  },
};

module.exports = organizationResolvers;
