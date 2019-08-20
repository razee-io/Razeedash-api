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
const objectHash = require('object-hash');

const buildPushObj = (newSearchableDataObj, oldSearchableDataObj = null) => {
  newSearchableDataObj = cleanObjKeysForMongo(newSearchableDataObj);
  oldSearchableDataObj = cleanObjKeysForMongo(oldSearchableDataObj || {});
  const keys = _.uniq(_.union(_.keys(newSearchableDataObj), _.keys(oldSearchableDataObj)));
  const updatedKeys = [];
  _.each(keys, (key) => {
    const newVal = newSearchableDataObj[key];
    const oldVal = oldSearchableDataObj[key];
    if (newVal !== oldVal) {
      if (objectHash(_.isUndefined(newVal) ? null : newVal) === objectHash(_.isUndefined(oldVal) ? null : oldVal)) {
        return;
      }
      updatedKeys.push(key);
    }
  });
  if (updatedKeys.length < 1) {
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
          $each: [{ timestamp: Date.now(), val: newSearchableDataObj[keyName] }],
          $slice: -100,
        };
      }
    ),
  };
  return out;
};

const cleanObjKeysForMongo = (obj) => {
  // makes sure an obj we're inserting doesnt have invalid chars in its keys (recursively). or mongo will get mad
  obj = _.clone(obj);
  _.forEach(obj, (val, key) => {
    if (_.isObject(val)) {
      if (_.isArray(val)) {
        val = _.map(val, cleanObjKeysForMongo);
      } else {
        val = cleanObjKeysForMongo(val);
        obj[key] = val;
      }
    }
    if (_.isNumber(key) || key.match(/^[a-z0-9_]*$/i)) {
      return;
    }
    let newKey = key.replace(/[^a-z0-9_]/ig, '_');
    delete obj[key];
    obj[newKey] = val;
  });
  return obj;
};

const buildSearchableDataForResource = (org, obj) => {
  var kind = obj.kind;
  let searchableAttrs = [
    { name: 'kind', attrPath: 'kind', },
    { name: 'name', attrPath: 'metadata.name', },
    { name: 'namespace', attrPath: 'metadata.namespace', },
    { name: 'apiVersion', attrPath: 'apiVersion', },
    { name: 'annotations', attrPath: 'metadata.annotations', },
    { name: 'imageID', attrPath: 'status.containerStatuses[0].imageID', },
    { name: 'image', attrPath: 'status.containerStatuses[0].image', }
  ];

  // adds this org's custom attrs
  var customSearchableAttrs = _.get(org, 'customSearchableAttrs', {});
  var searchableAttrsForKind = _.get(customSearchableAttrs, kind, []);
  searchableAttrs = _.concat(searchableAttrs, _.map(searchableAttrsForKind, (attrPath) => {
    return { attrPath };
  }));

  let out = {};
  _.each(searchableAttrs, (searchableAttr) => {
    if (searchableAttr.name === 'annotations') {
      const annotations = _.get(obj, searchableAttr.attrPath, null);
      for (let key in annotations) {
        const sanitizedName = `annotations["${key.replace(/[^a-z0-9_"'[\]]/gi, '_')}"]`;
        out[sanitizedName] = annotations[key];
      }
    } else {
      let saveAsName = (searchableAttr.name || searchableAttr.attrPath).replace(/[^a-z0-9_"'[\]]/gi, '_');
      let valToSave = _.get(obj, searchableAttr.attrPath, null);
      if (_.isObject(valToSave) || _.isArray(valToSave)) {
        valToSave = cleanObjKeysForMongo(valToSave);
      }
      if (valToSave) {
        out[saveAsName] = valToSave;
      }
    }
  });
  return out;
};

const getCluster = async (req, res, next) => {
  const cluster_id = req.params.cluster_id;

  if (!req.org) {
    res.status(401).send('org required');
    return;
  }

  if (!cluster_id) {
    res.status(401).send('cluster_id required');
    return;
  }

  const Clusters = req.db.collection('clusters');
  const cluster = await Clusters.findOne({ org_id: req.org._id, cluster_id: cluster_id });
  if (!cluster) {
    res.status(403).send(`Cluster ${cluster_id} not found`);
    return;
  }
  req.cluster = cluster; // eslint-disable-line require-atomic-updates
  next();
};

var buildHashForResource = (resourceObj, org)=>{
  // builds the list of things that when changed, will require us to resave the db data for an obj
  // i.e., if anything in a resource obj changes, then triggers resave
  // also, if the customSearchableAttrs for the org changes, then triggers resave
  var dataToHash = {
    resourceObj,
    orgData: {
      customSearchableAttrs: _.get(org, 'customSearchableAttrs', {}),
    },
  };
  return objectHash(dataToHash);
};

module.exports = {
  buildPushObj,
  cleanObjKeysForMongo,
  buildSearchableDataForResource,
  getCluster,
  buildHashForResource,
};
