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
const { withFilter } = require('apollo-server');
const GraphqlFields = require('graphql-fields');

const buildSearchForResources = require('../utils');
const { ACTIONS, TYPES } = require('../models/const');
const { EVENTS, pubSubPlaceHolder, getStreamingTopic } = require('../subscription');
const { whoIs, validAuth } = require ('./common');
const ObjectId = require('mongoose').Types.ObjectId;

const conf = require('../../conf.js').conf;
const S3ClientClass = require('../../s3/s3Client');
const url = require('url');

const commonResourcesSearch = async ({ models, org_id, searchFilter, limit, queryFields, req_id, logger }) => {
  try {
    const resources = await models.Resource.find(searchFilter)
      .sort({ created: -1 })
      .limit(limit)
      .lean()
    ;
    // if user is requesting the cluster field (i.e cluster_id/name), then adds it to the results
    if(queryFields['cluster']){
      const clusterIds = _.uniq(_.map(resources, 'cluster_id'));
      if(clusterIds.length > 0){
        let clusters = await models.Cluster.find({ org_id, cluster_id: { $in: clusterIds }});
        clusters = _.map(clusters, (cluster)=>{
          cluster.name = cluster.name || (cluster.metadata||{}).name || cluster.cluster_id;
          return cluster;
        });
        clusters = _.keyBy(clusters, 'cluster_id');
        resources.forEach((resource)=>{
          resource.cluster = clusters[resource.cluster_id] || null;
        });
      }
    }
    return resources;
  } catch (error) {
    logger.error(error, `commonResourcesDistributedSearch encountered an error for the request ${req_id}`);
    throw error;
  }  
};

const isLink = (s) => {
  return /^(http|https):\/\/?/.test(s);
};

const s3IsDefined = () => {
  return conf.s3.endpoint;
};

const getS3Data = async (s3Link, logger) => {
  try {
    const s3Client = new S3ClientClass(conf);
    const link = url.parse(s3Link); 
    const paths = link.path.split('/');
    const bucket = paths[1];
    const resourceName = decodeURI(paths[2]);
    const s3stream = s3Client.getObject(bucket, resourceName).createReadStream();
    const yaml = await readS3File(s3stream);
    return yaml;
  } catch (error) {
    logger.error(error, 'Error retrieving data from s3 bucket');
    throw(error);
  }
};

const readS3File = async (readable) => {
  readable.setEncoding('utf8');
  let data = '';
  for await (const chunk of readable) {
    data += chunk;
  }
  return data;
};

const resourceResolvers = {
  Query: {
    resourcesCount: async (parent, { org_id }, context) => {
      const queryName = 'resourcesCount';
      const { models, me, req_id, logger } = context;
      logger.debug({req_id, user: whoIs(me), org_id }, `${queryName} enter`);    
      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      let count = 0;
      try {
        count = await models.Resource.count({
          org_id: org_id,
          deleted: false,
        });
      } catch (error) {
        logger.error(error, 'resourcesCount encountered an error');
        throw error;
      }
      return count;
    },
    resources: async (
      parent,
      { org_id, filter, fromDate, toDate, limit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resources';
      const { models, me, req_id, logger } = context;
      logger.debug( {req_id, user: whoIs(me), org_id, filter, fromDate, toDate, limit }, `${queryName} enter`);

      limit = _.clamp(limit, 20, 500);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      let searchFilter = { org_id: org_id, deleted: false };
      if ((filter && filter !== '') || fromDate != null || toDate != null) {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      return commonResourcesSearch({ models, org_id, searchFilter, limit, queryFields, req_id, logger });
    },

    resourcesByCluster: async (
      parent,
      { org_id, cluster_id, filter, limit },
      context,
      fullQuery
    ) => {
      const queryFields = GraphqlFields(fullQuery);
      const queryName = 'resourcesByCluster';
      const { models, me, req_id, logger } = context;
      logger.debug( {req_id, user: whoIs(me), org_id, filter, limit }, `${queryName} enter`);

      limit = _.clamp(limit, 20, 500);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);
      let searchFilter = {
        org_id: org_id,
        cluster_id: cluster_id,
        deleted: false,
      };
      if (filter && filter !== '') {
        searchFilter = buildSearchForResources(searchFilter, filter);
      }
      logger.debug({req_id}, `searchFilter=${JSON.stringify(searchFilter)}`);
      return commonResourcesSearch({ models, org_id, searchFilter, limit, queryFields, req_id, logger });
    },

    resource: async (parent, { org_id, _id }, context) => {
      const queryName = 'resource';
      const { models, me, req_id, logger } = context;
      logger.debug( {req_id, user: whoIs(me), _id }, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);

      let result = await models.Resource.findOne({ org_id, _id: ObjectId(_id) }).lean();
      if(!result){
        throw `resource { org_id: ${org_id}, _id: ${_id} } not found`;
      }

      // 'result.data' will either be a yaml string or will be a link to a file in COS.
      // If it's a link then we need to download it and return its contents
      if (result.data && isLink(result.data) && s3IsDefined()) {
        const yaml = getS3Data(result.data, logger);
        result.data = yaml;
      } 
      return result;
    },

    resourceByKeys: async (
      parent,
      { org_id, cluster_id, selfLink },
      context,
    ) => {
      const queryName = 'resourceByKeys';
      const { models, me, req_id, logger } = context;
      logger.debug( {req_id, user: whoIs(me), org_id, cluster_id, selfLink}, `${queryName} enter`);

      await validAuth(me, org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);
      let result = await models.Resource.findOne({
        org_id,
        cluster_id,
        selfLink,
      }).lean();
      return result;
    },
  },

  Subscription: {
    resourceUpdated: {
      resolve: (parent, { org_id, filter }, { models, me, req_id, logger }) => {
        logger.debug(
          { modelKeys: Object.keys(models), org_id, filter, me, req_id },
          'Subscription.resourceUpdated.resolve',
        );
        const { resourceUpdated } = parent;
        return resourceUpdated;
      },

      subscribe: withFilter(
        // eslint-disable-next-line no-unused-vars
        (parent, args, context) => {
          const topic = getStreamingTopic(EVENTS.RESOURCE.UPDATED, args.org_id);
          context.logger.debug({args, me: context.me, topic}, 'withFilter asyncIteratorFn');
          // TODO: in future probably we should valid authorization here
          return pubSubPlaceHolder.pubSub.asyncIterator(topic);
        },
        async (parent, args, context) => {
          const queryName = 'subscribe: withFilter';
          const { me, req_id, logger } = context;
          logger.debug( {req_id, user: whoIs(me), args }, 
            `${queryName}: context.keys: [${Object.keys(context)}]`,
          );
          await validAuth(me, args.org_id, ACTIONS.READ, TYPES.RESOURCE, queryName, context);  
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
          logger.debug({ req_id, args, found }, 'subscribe: withFilter result');
          return Boolean(found);
        },
      ),
    },
  },
};

module.exports = resourceResolvers;
