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

const _ = require('lodash');
const { AuthenticationError, withFilter } = require('apollo-server');

const buildSearchForResources = require('../utils');
const { ACTIONS, TYPES } = require('../models/const');
const { EVENTS, pubSubPlaceHolder } = require('../subscription');

const commonResourcesSearch = async (models, searchFilter, limit) => {
  let results = [];
  results = await models.Resource.find(searchFilter)
    .sort({ created: -1 })
    .limit(limit)
    .lean();
  return results;
};

const whoIs = me => { 
  if (me === null || me === undefined) return 'null';
  if (me.email) return me.email;
  return me._id;
};

// Validate is user is authorized for the requested action.
// Throw exception if not.
const validAuth = async (me, org_id, action, type, models, queryName, logger) => {
  if (me === null || !(await models.User.isAuthorized(me, org_id, action, type))) {
    logger.error(
      `AuthenticationError - ${queryName}, user: ${whoIs(me)}, org_id: ${org_id}, action: ${action}, Type: ${type}`,
    );
    throw new AuthenticationError(
      `You are not allowed to access resources under this organization for the query ${queryName}.`,
    );
  }
};

const resourceResolvers = {
  Query: {
    resourcesCount: async (parent, { org_id }, { models, me, logger }) => {
      const queryName = 'resourcesCount';
      logger.debug(
        `${queryName}: user: ${whoIs(me)}, org_id: ${org_id}`,
      );      
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);

      let count = 0;
      try {
        count = await models.Resource.count({
          org_id: org_id,
          deleted: false,
        });
      } catch (error) {
        logger.error(`resourcesCount encountered an error ${error.stack}`);
        throw error;
      }
      return count;
    },

    resources: async (
      parent,
      { org_id, filter, fromDate, toDate, limit },
      { models, me, logger},
    ) => {
      const queryName = 'resources';
      logger.debug(
        `${queryName}: user: ${whoIs(me)}, org_id: ${org_id}, filter: ${filter}, fromDate: ${fromDate}, toDate: ${fromDate}, limit: ${limit}`,
      );
      if ( limit < 0 ) limit = 20;
      if ( limit > 50 ) limit = 50;
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);

      let searchFilter = { org_id: org_id, deleted: false };
      if ((filter && filter !== '') || fromDate != null || toDate != null) {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      return commonResourcesSearch(models, searchFilter, limit);
    },

    resourcesByCluster: async (
      parent,
      { org_id, cluster_id, filter, limit },
      { models, me, logger },
    ) => {
      const queryName = 'resourcesByCluster';
      logger.debug(
        `${queryName}: user: ${whoIs(me)}, org_id: ${org_id}, filter: ${filter}, limit: ${limit}`,
      );
      if ( limit < 0 ) limit = 20;
      if ( limit > 50 ) limit = 50;
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);
      let searchFilter = {
        org_id: org_id,
        cluster_id: cluster_id,
        deleted: false,
      };
      if (filter && filter !== '') {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      logger.debug(`searchFilter=${JSON.stringify(searchFilter)}`);
      return commonResourcesSearch(models, searchFilter, 50);
    },

    resource: async (parent, { _id }, { models, me, logger }) => {
      const queryName = 'resource';
      logger.debug(
        `${queryName}: user: ${whoIs(me)}, resource _id: ${_id}`,
      );
      let result = await models.Resource.findById(_id).lean();
      if (result != null) {
        await validAuth(me, result.org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);
      }
      return result;
    },

    resourceByKeys: async (
      parent,
      { org_id, cluster_id, selfLink },
      { models, me, logger },
    ) => {
      const queryName = 'resourceByKeys';
      logger.debug(
        `${queryName}: user: ${whoIs(me)}, org_id: ${org_id}, cluster_id: ${cluster_id}, selfLink: ${selfLink}`,
      );
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, models, queryName, logger);
      let result = await models.Resource.findOne({
        org_id,
        cluster_id,
        selfLink,
      }).lean();
      return result;
    },
  },

  /*
  Mutation: {
    upsertResource: async (parent, { resource }, { models, logger }) => {
      if (AUTH_MODEL !== AUTH_MODELS.LOCAL) {
        throw new AuthenticationError(
          `Current authorization model ${AUTH_MODEL} does not support this operation.`,
        );
      }
      const { org_id, cluster_id, selfLink, data } = resource;
      let hash = '';
      if (resource.hash !== undefined && typeof resource.hash === 'string') {
        hash = resource.hash;
      }
      let deleted = false;
      if (
        resource.deleted !== undefined &&
        typeof resource.deleted === 'boolean'
      ) {
        deleted = resource.deleted;
      }
      let searchableData = {};
      if (
        resource.searchableData !== undefined &&
        typeof resource.searchableData === 'object'
      ) {
        searchableData = resource.searchableData;
      }
      let searchableDataHash = '';
      if (
        resource.searchableDataHash !== undefined &&
        typeof resource.searchableDataHash === 'string'
      ) {
        searchableDataHash = resource.searchableDataHash;
      }

      if (
        typeof org_id !== 'string' ||
        typeof cluster_id !== 'string' ||
        typeof selfLink !== 'string'
      ) {
        throw new TypeError(
          'org_id, cluster_id, and selfLink must be string type.',
        );
      }

      const resourceReturned = await models.Resource.findOneAndUpdate(
        { org_id, cluster_id, selfLink },
        {
          org_id,
          cluster_id,
          selfLink,
          hash,
          data,
          deleted,
          searchableData,
          searchableDataHash,
        },
        { new: true, upsert: true },
      );

      const resourcePublished = resourceReturned.toObject({
        flattenMaps: true,
      }); // for mongo only
      logger.debug(
        { resourcePublished },
        'upsertResource=>UPDATED resourcePublished=',
      );
      return resourceChangedFunc(resourcePublished);
    },
  },
  */

  Subscription: {
    resourceUpdated: {
      resolve: (parent, { org_id, filter }, { models, me, logger }) => {
        logger.debug(
          { models, org_id, filter, me },
          'Subscription.resourceUpdated.resolve',
        );
        const { resourceUpdated } = parent;
        return resourceUpdated;
      },

      subscribe: withFilter(
        // eslint-disable-next-line no-unused-vars
        (parent, args, context) => {
          return pubSubPlaceHolder.pubSub.asyncIterator(EVENTS.RESOURCE.UPDATED);
        },
        async (parent, args, context) => {
          const queryName = 'subscribe: withFilter';
          context.logger.debug(
            `${queryName}: context.keys: [${Object.keys(context)}], user: ${whoIs(context.me)}] args: ${JSON.stringify(args)}`,
          );
          await validAuth(context.me, args.org_id, ACTIONS.READ, TYPES.RESOURCE, context.models, queryName, context.logger);  
          let found = true;
          const { resource } = parent.resourceUpdated;
          if (args.org_id !== resource.org_id) {
            return false;
          }
          if (args.filter && args.filter !== '') {
            const tokens = _.filter(args.filter.split(/\s+/));
            // eslint-disable-next-line no-restricted-syntax
            for (const token of tokens) {
              if (
                resource.cluster_id.match(token) ||
                resource.selfLink.match(token) ||
                (resource.searchableData.kind &&
                  resource.searchableData.kind.match(token)) ||
                (resource.searchableData.name &&
                  resource.searchableData.name.match(token)) ||
                (resource.searchableData.namespace &&
                  resource.searchableData.namespace.match(token))
              ) {
                // eslint-disable-next-line no-continue
                continue;
              }
              found = false;
              break;
            }
          }
          context.logger.debug({ args, found }, 'subscribe: withFilter result');
          return Boolean(found);
        },
      ),
    },
  },
};

module.exports = resourceResolvers;
