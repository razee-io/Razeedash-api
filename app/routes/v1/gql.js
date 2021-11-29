const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const mainServer = require('../../');


const sendReqToGraphql = async({ req, res, query, variables, operationName })=>{
  req.path = req.url = req.originalUrl = '/graphql';
  req.body = {
    query,
    variables,
    operationName,
  };
  req.method = 'POST';
  mainServer.app.handle(req, res, {});
};

const getOrgId = (req, res, next)=>{
  const orgId = req.get('org-id') || req.body.orgId || req.query.orgId;
  if(!orgId){
    throw new Error('Please pass an orgId in an "org-id" header, an "orgId" post body param, or an orgId query string attribute');
  }
  req.orgId = orgId;
  next();
};


router.post('/channels', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Adds a new channel'
  const { orgId } = req;
  const operationName  = 'addChannel';
  const query = `
    mutation ${operationName}($orgId:  String!, $name: String!) {
      addChannel(orgId: $orgId, name: $name) {
        uuid
      }
    }
  `;
  const name = req.body.name;
  if(!name){
    throw new Error('needs { name }');
  }
  const variables = {
    orgId,
    name,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.get('/channels', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Gets all channels for an org'
  const { orgId } = req;
  const operationName  = 'channels';
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
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.post('/channels/:uuid/versions', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Adds a new channel version'
  const { orgId } = req;
  const operationName  = 'addChannelVersion';
  const query = `
    mutation ${operationName}($orgId:  String!, $channelUuid: String!, $name: String!, $type: String!, $content: String, ) {
      addChannelVersion(orgId: $orgId, channelUuid: $channelUuid, name: $name, type: $type, content: $content ){
        versionUuid
        success
      }
    }
  `;
  const channelUuid = req.params.uuid;
  const name = req.body.name;
  const type = req.body.type;
  const content = req.body.content;

  if(!name || !channelUuid || !type || !content){
    throw new Error('needs { channelUuid, name, type, content }');
  }
  const variables = {
    orgId,
    channelUuid,
    name,
    type,
    content,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.get('/clusters/clustersByOrgId', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['clusters']
  // #swagger.summary = 'Gets all clusters for an org'
  const { orgId } = req;
  const operationName  = 'clustersByOrgId';
  const query = `
    query ${operationName}($orgId: String!) {
      clustersByOrgId(orgId: $orgId) {
        id
        orgId
        clusterId
        metadata
      }
    }

  `;
  const variables = {
    orgId,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.post('/groups', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Adds a group'
  const { orgId } = req;
  const operationName  = 'addGroup';
  const query = `
    mutation ${operationName}($orgId:  String!, $name: String!) {
      addGroup(orgId: $orgId, name: $name) {
        uuid
      }
    }
  `;
  const name = req.body.name;
  if(!name){
    throw new Error('needs { name }');
  }
  const variables = {
    orgId,
    name,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.put('/groups/groupClusters', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Assigns a group to a cluster'
  const { orgId } = req;
  const operationName  = 'groupClusters';
  const query = `
    mutation ${operationName}($orgId:  String!, $uuid: String!, $clusters: [String!]!) {
      groupClusters(orgId: $orgId, uuid: $uuid, clusters: $clusters) {
        modified
      }
    }
  `;
  const uuid = req.body.uuid;
  const clusters = req.body.clusters;
  if(!uuid || !clusters){
    throw new Error('needs { uuid, clusters }');
  }
  const variables = {
    orgId,
    uuid,
    clusters,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.post('/subscriptions', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['subscriptions']
  // #swagger.summary = 'Adds a subscription'
  const { orgId } = req;
  const operationName  = 'addSubscription';
  const query = `
    mutation ${operationName}($orgId:  String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String!) {
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
    throw new Error('needs { name, groups, channelUuid, versionUuid }');
  }
  const variables = {
    orgId,
    name,
    groups,
    clusterId,
    channelUuid,
    versionUuid,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.get('/subscriptions/:uuid', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['subscriptions']
  // #swagger.summary = 'Gets a subscription'
  const { orgId } = req;
  const operationName  = 'subscription';
  const query = `
    query ${operationName}($orgId:  String!, $uuid: String!) {
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
  const variables = {
    orgId,
    uuid,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

module.exports = router;
