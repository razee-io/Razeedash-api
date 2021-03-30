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

const {
  whoIs, validAuth, BasicRazeeError, RazeeValidationError,
} = require ('./common');
const { ACTIONS, TYPES } = require('../models/const');
const _ = require('lodash');
var { genKey } = require('../../utils/orgs');

const organizationResolvers = {
  Query: {

    organizations: async (parent, args, context) => {
      const queryName = 'organizations';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, args, me: whoIs(me) }, `${queryName} enter`);
      return models.User.getOrgs(context);
    },
  },
  Mutation:{
    createOrgEncKey: async (parent, { orgId }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'createOrgEncryptionKey';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);
      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.ORGANIZATION, queryName, context);

      const org = await models.Organization.findOne({ _id: orgId }).lean();
      if(!org || !org._id){
        throw new RazeeValidationError(context.req.t('org id was not found'), context);
      }
      const liveKeys = _.filter(org.encKeys||[], (encKey)=>{
        return !encKey.deleted;
      });
      if(liveKeys.length >= 10){
        throw new BasicRazeeError(context.req.t('This org has too many encryption keys. Remove some before adding any new ones'), context);
      }

      const encKey = await genKey();

      const search = { _id: org._id };
      const updates = {
        $push: { encKeys: encKey },
      };
      await models.Organization.updateOne(search, updates);

      return _.omit(encKey, ['key']);
    },
    deleteOrgEncKey: async (parent, { orgId, encKeyId }, context)=>{
      const { models, me, req_id, logger } = context;
      const queryName = 'createOrgEncryptionKey';
      logger.debug({req_id, user: whoIs(me), orgId }, `${queryName} enter`);
      await validAuth(me, orgId, ACTIONS.MANAGE, TYPES.ORGANIZATION, queryName, context);

      const org = await models.Organization.findOne({ _id: orgId }).lean();
      if(!org || !org._id){
        throw new RazeeValidationError(context.req.t('org id was not found'), context);
      }

      const matchingEncKey = _.find(org.encKeys, (encKey)=>{
        return (encKey.id == encKeyId);
      });
      if(!matchingEncKey){
        throw new BasicRazeeError(context.req.t('An encryption key with this encKeyId was not found.'), context);
      }

      const otherLiveKeys = _.filter(org.encKeys||[], (encKey)=>{
        return !encKey.deleted && (encKey.id != encKeyId);
      });
      if(otherLiveKeys.length < 1){
        throw new BasicRazeeError(context.req.t('You cant delete the last encryption key for an org.'), context);
      }

      var search = {
        _id: org._id,
      };
      var updates = {
        $set: {
          'encKeys.$[element].deleted': true,
        },
      };
      var options = {
        arrayFilters: [
          {
            'element.id': encKeyId,
          },
        ],
      };
      await models.Organization.updateOne(search, updates, options);

      return {
        success: true,
      };
    },
  }
};

module.exports = organizationResolvers;
