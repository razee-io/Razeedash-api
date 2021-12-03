/**
* Copyright 2021 IBM Corp. All Rights Reserved.
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

const express = require('express');
const _ = require('lodash');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const mainServer = require('../../');
const log = require('../../log').createLogger('razeedash-api/app/routes/v1/gql');

const methodTypes = [
  'findOne', 'findMany', 'create', 'update',
];

// Send request to Graphql, but return a REST style response / code
const sendReqToGraphql = async({ req, res, query, variables, operationName, methodType, createdIdentifier })=>{
  const methodName = 'sendReqToGraphql';
  log.debug( `${methodName} entry, operationName: ${operationName}` );

  if(!_.includes(methodTypes, methodType)){
    throw new Error(`invalid methodType "${methodType}". valid options: ${JSON.stringify(methodTypes)}`);
  }

  const restReqType = req.method;
  const restReqPath = req.path;

  // Prevent Graphql handling from sending response, allow reformatting to REST specifications.
  res.oldSend = res.send.bind(res);
  res.send = function(gqlRes){
    log.debug( `${methodName} gqlRes: ${gqlRes}` );
    try {
      const resObj = JSON.parse(gqlRes);

      const resErrors = resObj['errors'];
      if( resErrors && resErrors.length > 0 ) {
        /*
        Note that code cannot currently differentiate between types of errors returned
        by Graphql, e.g. to return 401 when the client is not authorized to make the request
        or some other error.  400 BAD REQUEST is used for any Graphql error.
        */
        throw new Error(JSON.stringify({
          errors: _.map(resErrors, 'message'),
        }));
      }

      const resVal = resObj['data'][operationName];

      // If GET of a single item...
      if( restReqType == 'GET' ) {
        if(methodType == 'findOne' && !resVal){
          return this.status(404).oldSend('');
        }
        // One/Multiple expected, one/multiple found, return 200 (OK)
        return this.status(200).oldSend( JSON.stringify(resVal) );
      }
      // ElseIf PUT...
      else if( restReqType == 'PUT' ) {
        // Modification may or may not have been necessary, return 200 (OK)
        return this.status(200).oldSend( '' );  // Ideally should return the updated object(s) here, but graphql doesn't return that
      }
      // ElseIf POST...
      else if( restReqType == 'POST' ) {
        // One expected, one created, return 201 (CREATED) with `Location` header
        this.setHeader( 'Location', `${restReqPath}/${resVal[createdIdentifier||'uuid']}` );
        return this.status(201).oldSend( JSON.stringify(resVal) );
      }
      // Else (unexpected request type)
      throw new Error( `request type '${restReqType}' is unexpected` ); // Should never occur
    }
    catch( e ) {
      log.debug( `${methodName} error: ${e.message}` );
      return this.status(400).oldSend( e.message );
    }
  }.bind(res);

  req.path = req.url = req.originalUrl = '/graphql';
  req.body = {
    query,
    variables,
    operationName,
  };
  req.method = 'POST';

  // Send to Graphql
  await mainServer.app.handle(req, res, () => {});
};

const getOrgId = (req, res, next)=>{
  const orgId = req.get('org-id') || req.body.orgId || req.query.orgId;
  if(!orgId){
    res.status(400).send( 'Please pass an orgId in an "org-id" header, an "orgId" post body param, or an orgId query string attribute' );
    return;
  }
  req.orgId = orgId;
  next();
};

const postChannels = async (req, res) => {
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Adds a channel'
  const { orgId } = req;
  const operationName = 'addChannel';
  const query = `
    mutation ${operationName}($orgId: String!, $name: String!) {
      addChannel(orgId: $orgId, name: $name) {
        uuid
      }
    }
  `;
  const name = req.body.name;
  if(!name){
    res.status(400).send( 'needs { name }' );
    return;
  }
  const variables = {
    orgId,
    name,
  };
  const methodType = 'create';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType, createdIdentifier: 'uuid' });
};
router.post('/channels', getOrgId, asyncHandler(postChannels));

const getChannels = async (req, res) => {
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Gets all channels'
  const { orgId } = req;
  const operationName = 'channels';
  const query = `
    query ${operationName}($orgId: String!) {
      channels(orgId: $orgId) {
        uuid
        orgId
        name
        created
        versions {
          name
          description
          uuid
          created
        }
      }
    }

  `;
  const variables = {
    orgId,
  };
  const methodType = 'findMany';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/channels', getOrgId, asyncHandler(getChannels));

const getChannel = async (req, res) => {
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Gets a specified channel'
  const { orgId } = req;
  const operationName = 'channel';
  const query = `
    query ${operationName}($orgId: String!, $uuid: String!) {
      clusterByClusterId(orgId: $orgId, uuid: $uuid) {
        uuid
        orgId
        name
        created
        versions {
          name
          description
          uuid
          created
        }
      }
    }
  `;
  const uuid = req.params.uuid;
  if(!uuid){
    res.status(400).send( 'needs { uuid }' );
    return;
  }
  const variables = {
    orgId,
    uuid,
  };
  const methodType = 'findOne';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/channels/:uuid', getOrgId, asyncHandler(getChannel));

const postChannelVersion = async (req, res) => {
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Adds a new channel version'
  const { orgId } = req;
  const operationName = 'addChannelVersion';
  const query = `
    mutation ${operationName}($orgId: String!, $channelUuid: String!, $name: String!, $type: String!, $content: String, ) {
      addChannelVersion(orgId: $orgId, channelUuid: $channelUuid, name: $name, type: $type, content: $content ){
        versionUuid
        success
      }
    }
  `;
  const channelUuid = req.params.channelUuid;
  const name = req.body.name;
  const type = req.body.type;
  const content = req.body.content;
  if(!name || !channelUuid || !type || !content){
    res.status(400).send( 'needs { channelUuid, name, type, content }' );
    return;
  }
  const variables = {
    orgId,
    channelUuid,
    name,
    type,
    content,
  };
  const methodType = 'create';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType, createdIdentifier: 'versionUuid' });
};
router.post('/channels/:channelUuid/versions', getOrgId, asyncHandler(postChannelVersion));

const getChannelVersion = async (req, res) => {
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Gets a specified channel version'
  const { orgId } = req;
  const operationName = 'channelVersion';
  const query = `
    query ${operationName}($orgId: String!, $channelUuid: String!, $versionUuid: String!) {
      channelVersion(orgId: $orgId, channelUuid: $channelUuid, versionUuid: $versionUuid) {
        uuid
        name
        description
        created
      }
    }
  `;
  const channelUuid = req.params.channelUuid;
  const versionUuid = req.params.versionUuid;
  if(!channelUuid || !versionUuid){
    res.status(400).send( 'needs { channelUuid, versionUuid }' );
    return;
  }
  const variables = {
    orgId,
    channelUuid,
    versionUuid,
  };
  const methodType = 'findOne';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/channels/:channelUuid/versions/:versionUuid', getOrgId, asyncHandler(getChannelVersion));

const getClusters = async (req, res) => {
  // #swagger.tags = ['clusters']
  // #swagger.summary = 'Gets all clusters'
  const { orgId } = req;
  const operationName = 'clustersByOrgId';
  const query = `
    query ${operationName}($orgId: String!) {
      clustersByOrgId(orgId: $orgId) {
        orgId
        clusterId
        groups { uuid name }
        registration
        metadata
      }
    }

  `;
  const variables = {
    orgId,
  };
  const methodType = 'findMany';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/clusters', getOrgId, asyncHandler(getClusters));

const getCluster = async (req, res) => {
  // #swagger.tags = ['clusters']
  // #swagger.summary = 'Gets a specified cluster'
  const { orgId } = req;
  const operationName = 'clusterByClusterId';
  const query = `
    query ${operationName}($orgId: String!, $clusterId: String!) {
      clusterByClusterId(orgId: $orgId, clusterId: $clusterId) {
        orgId
        clusterId
        groups { uuid name }
        registration
        metadata
      }
    }
  `;
  const clusterId = req.params.clusterId;
  if(!clusterId){
    res.status(400).send( 'needs { clusterId }' );
    return;
  }
  const variables = {
    orgId,
    clusterId,
  };
  const methodType = 'findOne';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/clusters/:clusterId', getOrgId, asyncHandler(getCluster));

const postGroups = async (req, res) => {
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Adds a group'
  const { orgId } = req;
  const operationName = 'addGroup';
  const query = `
    mutation ${operationName}($orgId: String!, $name: String!) {
      addGroup(orgId: $orgId, name: $name) {
        uuid
      }
    }
  `;
  const name = req.body.name;
  if(!name){
    res.status(400).send( 'needs { name }' );
    return;
  }
  const variables = {
    orgId,
    name,
  };

  /*
  Note that cannot create a group with clusters in one step at this time.
  The graphql for group creation does not currently suport this. Instead,
  client must first create the group with just a name and then use
  `PUT /groups/uuid` to set the clusters in the group.
  Enhancing the graphql, or updating this code to be able to send more
  than one graphql request to satisfy a single REST POST would be desirable
  as a future enhancement.
  */

  const methodType = 'create';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType, createdIdentifier: 'uuid' });
};
router.post('/groups', getOrgId, asyncHandler(postGroups));

// PUT to a group only supports setting clusters (can't change name etc)
const putGroup = async (req, res) => {
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Sets the clusters for a specified group'
  const { orgId } = req;
  const operationName = 'groupClusters';
  const query = `
    mutation ${operationName}($orgId: String!, $uuid: String!, $clusters: [String!]!) {
      groupClusters(orgId: $orgId, uuid: $uuid, clusters: $clusters) {
        modified
      }
    }
  `;
  const uuid = req.params.uuid;
  const clusters = req.body.clusters;
  if(!uuid || !clusters){
    res.status(400).send( 'needs { uuid, clusters }' );
    return;
  }
  const variables = {
    orgId,
    uuid,
    clusters,
  };
  const methodType = 'update';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.put('/groups/:uuid', getOrgId, asyncHandler(putGroup));

const getGroups = async (req, res) => {
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Gets all groups'
  const { orgId } = req;
  const operationName = 'groups';
  const query = `
    query ${operationName}($orgId: String!) {
      groups(orgId: $orgId) {
        uuid
        name
        orgId
        clusters { clusterId }
      }
    }
  `;
  const variables = {
    orgId,
  };
  const methodType = 'findMany';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/groups', getOrgId, asyncHandler(getGroups));

const getGroup = async (req, res) => {
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Gets a specified group'
  const { orgId } = req;
  const operationName = 'group';
  const query = `
    query ${operationName}($orgId: String!, $uuid: String!) {
      group(orgId: $orgId, uuid: $uuid) {
        uuid
        name
        orgId
        clusters { clusterId }
      }
    }
  `;
  const uuid = req.params.uuid;
  if(!uuid){
    res.status(400).send( 'needs { uuid }' );
    return;
  }
  const variables = {
    orgId,
    uuid,
  };
  const methodType = 'findOne';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/groups/:uuid', getOrgId, asyncHandler(getGroup));

const postSubscriptions = async (req, res) => {
  // #swagger.tags = ['subscriptions']
  // #swagger.summary = 'Adds a subscription'
  const { orgId } = req;
  const operationName = 'addSubscription';
  const query = `
    mutation ${operationName}($orgId: String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String!) {
      addSubscription(orgId: $orgId, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid) {
        uuid
      }
    }
  `;
  const name = req.body.name;
  const groups = req.body.groups;
  const clusterId = req.body.clusterId;
  const channelUuid = req.body.channelUuid;
  const versionUuid = req.body.versionUuid;
  if(!name || !groups || clusterId || !channelUuid || !versionUuid){
    res.status(400).send( 'needs { name, groups, channelUuid, versionUuid }' );
    return;
  }
  const variables = {
    orgId,
    name,
    groups,
    clusterId,
    channelUuid,
    versionUuid,
  };
  const methodType = 'create';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType, createdIdentifier: 'uuid' });
};
router.post('/subscriptions', getOrgId, asyncHandler(postSubscriptions));

const getSubscriptions = async (req, res) => {
  // #swagger.tags = ['subscriptions']
  // #swagger.summary = 'Gets all subscriptions'
  const { orgId } = req;
  const operationName = 'subscriptions';
  const query = `
    query ${operationName}($orgId: String!) {
      subscriptions(orgId: $orgId) {
        uuid
        orgId
        name
        groups
        channelName
        channelUuid
        version
        versionUuid
        kubeOwnerName
      }
    }
  `;
  const variables = {
    orgId,
  };
  const methodType = 'findMany';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/subscriptions', getOrgId, asyncHandler(getSubscriptions));

const getSubscription = async (req, res) => {
  // #swagger.tags = ['subscriptions']
  // #swagger.summary = 'Gets a specified subscription'
  const { orgId } = req;
  const operationName = 'subscription';
  const query = `
    query ${operationName}($orgId: String!, $uuid: String!) {
      subscription(orgId: $orgId, uuid: $uuid) {
        uuid
        orgId
        name
        groups
        channelName
        channelUuid
        version
        versionUuid
        kubeOwnerName
      }
    }
  `;
  const uuid = req.params.uuid;
  if(!uuid){
    res.status(400).send( 'needs { uuid }' );
    return;
  }
  const variables = {
    orgId,
    uuid,
  };
  const methodType = 'findOne';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.get('/subscriptions/:uuid', getOrgId, asyncHandler(getSubscription));


const updateClusterResources = async (req, res) => {
  // #swagger.tags = ['clusters']
  // #swagger.summary = 'Updates resources for a cluster'
  const { orgId } = req;
  const operationName = 'updateClusterResources';
  const query = `
    mutation ${operationName}($clusterId:String!, $orgId:String!, $resourceChanges: [ResourceChange]!) {
      updateClusterResources(clusterId:$clusterId, orgId: $orgId, resourceChanges:$resourceChanges){
        success
      }
    }
  `;
  const clusterId = req.params.clusterId;
  const resourceChanges = req.body;
  if(!clusterId){
    throw new Error('needs { clusterId }');
  }
  if(!resourceChanges || !_.isArray(resourceChanges)){
    throw new Error('body must be an array of resourceChanges');
  }
  const variables = {
    orgId,
    clusterId,
    resourceChanges,
  };
  const methodType = 'update';
  await sendReqToGraphql({ req, res, query, variables, operationName, methodType });
};
router.put('/clusters/:clusterId/resources', getOrgId, asyncHandler(updateClusterResources));

module.exports = router;
