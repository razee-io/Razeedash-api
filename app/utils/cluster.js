/**
* Copyright 2019 IBM Corp. All Rights Reserved.
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
const uuid = require('uuid');
const request = require('request-promise-native');
const Validator = require('jsonschema').Validator;
const clusterSchema = require('../schemas/clusters.js');
const objectHash = require('object-hash');

const buildPushObj = (newSearchableDataObj, oldSearchableDataObj=null) => {
  newSearchableDataObj = cleanObjKeysForMongo(newSearchableDataObj);
  oldSearchableDataObj = cleanObjKeysForMongo(oldSearchableDataObj || {});
  const keys = _.uniq(_.union(_.keys(newSearchableDataObj), _.keys(oldSearchableDataObj)));
  const updatedKeys = [];
  _.each(keys, (key) => {
    const newVal = newSearchableDataObj[key];
    const oldVal = oldSearchableDataObj[key];
    if(newVal !== oldVal) {
      if(objectHash(_.isUndefined(newVal) ? null : newVal) === objectHash(_.isUndefined(oldVal) ? null : oldVal)) {
        return;
      }
      updatedKeys.push(key);
    }
  });
  if(updatedKeys.length < 1) {
    return {};
  }
  /**
   * builds this format:
   * { $push: {
   *     "searchableDataHist.kind": [ {
   *         $each: [ { timestamp: int, val: theNewVal } ],
   *         $slice: 100
   *     } ],
   *     "searchableDataHist.xyz": ...,
   *     ...
   * } }
   */
  const out = {
    $push: _.mapValues(
      _.mapKeys(updatedKeys, (keyName) => {
        return `searchableDataHist.${keyName}`;
      }),
      (keyName) => {
        return {
          $each: [ { timestamp: Date.now(), val: newSearchableDataObj[keyName] } ],
          $slice: -100,
        };
      }
    ),
  };
  return out;
};

const cleanObjKeysForMongo = (obj)=>{
  // makes sure an obj we're inserting doesnt have invalid chars in its keys (recursively). or mongo will get mad
  obj = _.clone(obj);
  _.forEach(obj, (val, key)=>{
    if(_.isObject(val)){
      if(_.isArray(val)){
        val = _.map(val, cleanObjKeysForMongo);
      } else {
        val = cleanObjKeysForMongo(val);
        obj[key] = val;
      }
    }
    if(_.isNumber(key) || key.match(/^[a-z0-9_]*$/i)){
      return;
    }
    let newKey = key.replace(/[^a-z0-9_]/ig, '_');
    delete obj[key];
    obj[newKey] = val;
  });
  return obj;
};

const buildSearchableDataForResource = (obj) => {
  const kind = obj.kind;
  const searchableAttrs = [
    { name: 'kind', attrPath: 'kind', },
    { name: 'name', attrPath: 'metadata.name', },
    { name: 'namespace', attrPath: 'metadata.namespace', },
    { name: 'apiVersion', attrPath: 'apiVersion', },
  ];
  if(kind == 'ConfigMap'){
    searchableAttrs.push( { attrPath:'data.random' });
  }
  let out = {};
  _.each(searchableAttrs, (searchableAttr) => {
    let saveAsName = (searchableAttr.name || searchableAttr.attrPath).replace(/[^a-z0-9_]/gi, '_');
    let valToSave = _.get(obj, searchableAttr.attrPath, null);
    if(_.isObject(valToSave) || _.isArray(valToSave)){
      valToSave = cleanObjKeysForMongo(valToSave);
    }
    _.set(out, saveAsName, valToSave);
  });

  return out;
};

const getCluster = async(req, res, next) => {
  const cluster_id = req.params.cluster_id;

  if ( !req.org ) {
    res.status(401).send( 'org required' );
    return;
  }

  if (!cluster_id) {
    res.status(401).send( 'cluster_id required' );
    return;
  }

  const Clusters = req.db.collection('clusters');
  const cluster = await Clusters.findOne({ org_id: req.org._id, cluster_id: cluster_id });
  if (!cluster) {
    res.status(403).send(`Cluster ${cluster_id} not found`);
    return;
  }
  req.cluster = cluster;
  next();
};

const onBlackList = function (cluster_info) {
  if (!cluster_info) {
    return true;
  }
  return /fakecruiser/.test(cluster_info.cluster_name);
};

const checkClusterInfo = function(cluster_info) {
  if(!cluster_info) {
    return false;
  }
  
  const validator = new Validator();
  validator.addSchema(clusterSchema);
  const results = validator.validate(cluster_info, clusterSchema);
  return results.errors.length > 0 ? false: true;
};

const triggerWebhooksForClusterId = async(log, clusterId, deploymentId, inputDeploymentObj, req) => {
  const Clusters = req.db.collection('clusters');
  const cluster = await Clusters.findOne({ cluster_id: clusterId });
  if (!cluster) {
    return false;
  }
  var webhooks = cluster.webhooks || [];
  var metadata = cluster.metadata || [];
  var postData = {
    cluster_id: clusterId,
    cluster_name: metadata.name,
    config_version: cluster.config_version,
    deployment: inputDeploymentObj,
  };
  var success = true;

  _.each(webhooks, async (webhook) => {
    var webhookId = webhook.id;
    var url = webhook.url;
    var hasError = false;
    var resp = '';
    postData.request_id = uuid();
    const options = {
      method: 'POST',
      uri: url,
      body: {
        data: postData
      },
      json: true
    };
    try {
      req.log.debug({ webhookId, url, clusterId }, 'POSTing webhook');
      resp = await request(options);
    }
    catch (e) {
      success = false;
      hasError = true;
      resp = e;
      req.log.error({ err: e.message, url }, 'Error POSTing webhook');
    }
    var logObj = {
      webhook_id: webhookId,
      cluster_id: clusterId,
      deployment_id: deploymentId,
      req: {
        url: url,
        payload: JSON.stringify(postData),
      },
      res: JSON.stringify(resp),
      hasError,
      created: new Date(),
    };
    const WebhookLogs = req.db.collection('webhookLogs');
    WebhookLogs.insert(logObj);
  });
  return success;
};

module.exports = {
  buildPushObj, 
  cleanObjKeysForMongo, 
  buildSearchableDataForResource, 
  getCluster,
  onBlackList,
  checkClusterInfo,
  triggerWebhooksForClusterId
};
