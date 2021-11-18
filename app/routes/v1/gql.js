const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const mongoConf = require('../../conf.js').conf;
const MongoClientClass = require('../../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);
const storageFactory = require('./../../storage/storageFactory');
const getOrg = require('../../utils/orgs.js').getOrg;
const _ = require('lodash');
const mainServer = require('../../');


var sendReqToGraphql = async({ req, res, query, variables, operationName })=>{
  req.path = req.url = req.originalUrl = '/graphql';
  req.body = {
    query,
    variables,
    operationName,
  };
  req.method = 'POST';
  console.log(555555, req.path, req.body, req.headers)
  mainServer.app.handle(req, res, {});
};

var getOrgId = (req, res, next)=>{
  const orgId = req.get('org-id') || req.body.orgId || req.query.orgId;
  if(!orgId){
    throw new Error(`Please pass an orgId in an "org-id" header, an "orgId" post body param, or an orgId query string attribute`);
  }
  req.orgId = orgId;
  next();
};


router.post('/channels', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Adds a new channel'
  var { orgId } = req;
  var operationName  = 'addChannel';
  var query = `
    mutation ${operationName}($orgId:  String!, $name: String!) {
      addChannel(orgId: $orgId, name: $name) {
        uuid
      }
    }
  `;
  var name = req.body.name;
  if(!name){
    throw new Error(`needs { name }`);
  }
  var variables = {
    orgId,
    name,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.get('/channels', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Gets all channels for an org'
  var { orgId } = req;
  var operationName  = 'channels';
  var query = `
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
  var variables = {
    orgId,
  };
  console.log(3333, query, variables, operationName)
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.post('/channels/:uuid/versions', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['channels']
  // #swagger.summary = 'Adds a new channel version'
  var { orgId } = req;
  var operationName  = 'addChannelVersion';
  var query = `
    mutation ${operationName}($orgId:  String!, $channelUuid: String!, $name: String!, $type: String!, $content: String, ) {
      addChannelVersion(orgId: $orgId, channelUuid: $channelUuid, name: $name, type: $type, content: $content ){
        versionUuid
        success
      }
    }
  `;
  var channelUuid = req.params.uuid;
  var name = req.body.name;
  var type = req.body.type;
  var content = req.body.content;
  console.log(3333, {name, channelUuid, type, content})
  if(!name || !channelUuid || !type || !content){
    throw new Error(`needs { channelUuid, name, type, content }`);
  }
  var variables = {
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
  var { orgId } = req;
  var operationName  = 'clustersByOrgId';
  var query = `
    query ${operationName}($orgId: String!) {
      clustersByOrgId(orgId: $orgId) {
        id
        orgId
        clusterId
        metadata
      }
    }

  `;
  var variables = {
    orgId,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.post('/groups', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Adds a group'
  var { orgId } = req;
  var operationName  = 'addGroup';
  var query = `
    mutation ${operationName}($orgId:  String!, $name: String!) {
      addGroup(orgId: $orgId, name: $name) {
        uuid
      }
    }
  `;
  var name = req.body.name;
  if(!name){
    throw new Error(`needs { name }`);
  }
  var variables = {
    orgId,
    name,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.put('/groups/groupClusters', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['groups']
  // #swagger.summary = 'Assigns a group to a cluster'
  var { orgId } = req;
  var operationName  = 'groupClusters';
  var query = `
    mutation ${operationName}($orgId:  String!, $uuid: String!, $clusters: [String!]!) {
      groupClusters(orgId: $orgId, uuid: $uuid, clusters: $clusters) {
        modified
      }
    }
  `;
  var uuid = req.body.uuid;
  var clusters = req.body.clusters;
  if(!uuid || !clusters){
    throw new Error(`needs { uuid, clusters }`);
  }
  var variables = {
    orgId,
    uuid,
    clusters,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

router.post('/subscriptions', getOrgId, asyncHandler(async(req, res)=>{
  // #swagger.tags = ['subscriptions']
  // #swagger.summary = 'Adds a subscription'
  var { orgId } = req;
  var operationName  = 'addSubscription';
  var query = `
    mutation ${operationName}($orgId:  String!, $name: String!, $groups: [String!]!, $channelUuid: String!, $versionUuid: String!) {
      addSubscription(orgId: $orgId, name: $name, groups: $groups, channelUuid: $channelUuid, versionUuid: $versionUuid) {
        uuid
      }
    }
  `;
  var name = req.body.name;
  var groups = req.body.groups;
  var clusterId = req.body.clusterId;
  var channelUuid = req.body.channelUuid;
  var versionUuid = req.body.versionUuid;
  if(!name || !groups || clusterId || !channelUuid || !versionUuid){
    throw new Error(`needs { name, groups, channelUuid, versionUuid }`);
  }
  var variables = {
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
  var { orgId } = req;
  var operationName  = 'subscription';
  var query = `
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
  var uuid = req.params.uuid;
  var variables = {
    orgId,
    uuid,
  };
  sendReqToGraphql({ req, res, query, variables, operationName });
}));

module.exports = router;
