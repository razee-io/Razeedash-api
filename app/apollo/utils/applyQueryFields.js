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

var _ = require('lodash');
const { getGroupConditions } = require('../resolvers/common');
const { ACTIONS, CLUSTER_REG_STATES, CLUSTER_STATUS } = require('../models/const');

const applyQueryFieldsToClusters = async(clusters, queryFields={}, args, context)=>{
  var { models } = context;
  var { orgId, resourceLimit, groupLimit } = args;

  const clusterIds = _.map(clusters, 'cluster_id');
  resourceLimit = resourceLimit || 500;
  const now = new Date();

  _.each(clusters, (cluster)=>{
    cluster.name = cluster.name || (cluster.metadata || {}).name || (cluster.registration || {}).name || cluster.clusterId || cluster.id;
    cluster.status = CLUSTER_STATUS.UNKNOWN;
    if (cluster.reg_state === CLUSTER_REG_STATES.REGISTERING || cluster.reg_state === CLUSTER_REG_STATES.PENDING) {
      cluster.status = CLUSTER_STATUS.REGISTERED;
    } else if (cluster.reg_state === CLUSTER_REG_STATES.REGISTERED) {
      if (cluster.updated.getTime() < now.getTime() - 3600000 ) {
        cluster.status = CLUSTER_STATUS.INACTIVE;
      } else {
        cluster.status = CLUSTER_STATUS.ACTIVE;
      }
    }
  });
  if(queryFields.resources) {
    const resources = await models.Resource.find({ cluster_id: { $in: clusterIds } }).limit(resourceLimit).lean({virtuals: true});
    await applyQueryFieldsToResources(resources, queryFields.resources, args, context);

    const resourcesByClusterId = _.groupBy(resources, 'cluster_id');
    _.each(clusters, (cluster) => {
      cluster.resources = resourcesByClusterId[cluster.cluster_id] || [];
    });
  }

  if(queryFields.groupObjs || queryFields.groups){
    if(clusterIds.length > 0){
      // [
      //   {groups: [{name: 'tag1'}]},
      //   {groups: [{name: 'tag2'}]},
      // ]
      var groupNames = _.filter(_.uniq(_.map(_.flatten(_.map(clusters, 'groups')), 'name')));
      var groups = await models.Group.find({ org_id: orgId, name: { $in: groupNames } }).limit(groupLimit).lean({ virtuals: true });
      await applyQueryFieldsToGroups(groups, queryFields.groupObjs, args, context);

      var groupsByUuid = _.keyBy(groups, 'uuid');
      _.each(clusters, (cluster)=>{
        var clusterGroupUuids = _.map(cluster.groups, 'uuid');
        cluster.groupObjs = _.filter(_.pick(groupsByUuid, clusterGroupUuids));
        cluster.groups = _.filter(_.pick(groupsByUuid, clusterGroupUuids));
      });
    }
  }
};

const applyQueryFieldsToGroups = async(groups, queryFields={}, args, context)=>{
  var { models } = context;
  var { orgId } = args;

  if(queryFields.owner){
    const owners = await models.User.getBasicUsersByIds(_.uniq(_.map(groups, 'owner')));
    _.each(groups, (group)=>{
      group.owner = owners[group.owner] || owners.undefined;
    });
  }
  if(queryFields.subscriptions || queryFields.subscriptionCount){
    var groupNames = _.uniq(_.map(groups, 'name'));
    var subscriptions = await models.Subscription.find({ org_id: orgId, groups: { $in: groupNames } }).lean({ virtuals: true });
    await applyQueryFieldsToSubscriptions(subscriptions, queryFields.subscriptions, args, context);

    const subscriptionsByGroupName = {};
    _.each(subscriptions, (sub)=>{
      if(_.isUndefined(sub.channelName)){
        sub.channelName = sub.channel;
      }
      delete sub.channel; // can not render channel, too deep
      _.each(sub.groups, (groupName)=>{
        subscriptionsByGroupName[groupName] = subscriptionsByGroupName[groupName] || [];
        subscriptionsByGroupName[groupName].push(sub);
      });
    });
    _.each(groups, (group)=>{
      group.subscriptions = subscriptionsByGroupName[group.name] || [];
      group.subscriptionCount = group.subscriptions.length;
    });
  }
  if(queryFields.clusters || queryFields.clusterCount){
    var groupUuids = _.uniq(_.map(groups, 'uuid'));
    const clusters = await models.Cluster.find({ org_id: orgId, 'groups.uuid': { $in: groupUuids } }).lean({ virtuals: true });
    await applyQueryFieldsToClusters(clusters, queryFields.clusters, args, context);

    const clustersByGroupUuid = {};
    _.each(clusters, (cluster)=>{
      _.each(cluster.groups || [], (groupObj)=>{
        clustersByGroupUuid[groupObj.uuid] = clustersByGroupUuid[groupObj.uuid] || [];
        clustersByGroupUuid[groupObj.uuid].push(cluster);
      });
    });
    _.each(groups, (group)=>{
      group.clusters = clustersByGroupUuid[group.uuid] || [];
      group.clusterCount = group.clusters.length;
    });
  }
};

const applyQueryFieldsToResources = async(resources, queryFields={}, args, context)=>{
  var { models } = context;
  var { orgId, subscriptionsLimit = 500 } = args;

  if(queryFields.cluster){
    var clusterIds = _.map(resources, 'clusterId');
    var clusters = await models.Cluster.find({ org_id: orgId, cluster_id: { $in: clusterIds } }).lean({ virtuals: true });
    await applyQueryFieldsToClusters(clusters, queryFields.cluster, args, context);

    var clustersById = _.keyBy(clusters, 'clusterId');
    _.each(resources, (resource)=>{
      resource.cluster = clustersById[resource.clusterId];
    });
  }

  if(queryFields.subscription){
    var subscriptionUuids = _.filter(_.uniq(_.map(resources, 'searchableData.subscription_id')));
    var subscriptions = await models.Subscription.find({ uuid: { $in: subscriptionUuids } }).limit(subscriptionsLimit).lean({ virtuals: true });
    await applyQueryFieldsToSubscriptions(subscriptions, queryFields.subscription, args, context);

    _.each(subscriptions, (sub)=>{
      if(_.isUndefined(sub.channelName)){
        sub.channelName = sub.channel;
      }
    });
    var subscriptionsByUuid = _.keyBy(subscriptions, 'uuid');
    _.each(resources, (resource)=>{
      var subId = resource.searchableData.subscription_id;
      if(!subId){
        return;
      }
      resource.subscription = subscriptionsByUuid[subId] || null;
      if(resource.subscription) {
        delete resource.subscription.channel;
      }
    });
  }
};

const applyQueryFieldsToChannels = async(channels, queryFields={}, args, context)=>{ // eslint-disable-line
  const { models, me } = context;
  var { orgId } = args;

  if(queryFields.subscriptions){
    //piggyback basic-info of subscriptions associated with this channel that user allowed to see
    const conditions = await getGroupConditions(me, orgId, ACTIONS.READ, 'name', 'applyQueryFieldsToChannels queryFields.subscriptions', context);
    var channelUuids = _.uniq(_.map(channels, 'uuid'));
    var subscriptions = await models.Subscription.find({ org_id: orgId, channel_uuid: { $in: channelUuids }, ...conditions }, {}).lean({ virtuals: true });
    await applyQueryFieldsToSubscriptions(subscriptions, queryFields.subscriptions, args, context);

    var subscriptionsByChannelUuid = _.groupBy(subscriptions, 'channel_uuid');
    _.each(channels, (channel)=>{
      channel.subscriptions = subscriptionsByChannelUuid[channel.uuid] || [];
    });
  }
};

const applyQueryFieldsToSubscriptions = async(subs, queryFields={}, args, context)=>{ // eslint-disable-line
  var { models } = context;
  var { orgId } = args;

  _.each(subs, (sub)=>{
    if(_.isUndefined(sub.channelName)){
      sub.channelName = sub.channel;
    }
    delete sub.channel;
  });
  var subUuids = _.uniq(_.map(subs, 'uuid'));

  if(queryFields.channel){
    var channelUuids = _.uniq(_.map(subs, 'channelUuid'));
    var channels = await models.Channel.find({ uuid: { $in: channelUuids } });
    await applyQueryFieldsToChannels(channels, queryFields.channel, args, context);

    var channelsByUuid = _.keyBy(channels, 'uuid');
    _.each(subs, (sub)=>{
      var channelUuid = sub.channelUuid;
      var channel = channelsByUuid[channelUuid];
      sub.channel = channel;
    });
  }
  if(queryFields.resources){
    var resources = await models.Resource.find({ org_id: orgId, 'searchableData.subscription_id' : { $in: subUuids } }).lean({ virtuals: true });
    await applyQueryFieldsToResources(resources, queryFields.resources, args, context);

    var resourcesBySubUuid = _.groupBy(resources, 'searchableData.subscription_id');
    _.each(subs, (sub)=>{
      sub.resources = resourcesBySubUuid[sub.uuid] || [];
    });
  }
  if(queryFields.groupObjs){
    var groupNames = _.flatten(_.map(subs, 'groups'));
    var groups = await models.Group.find({ org_id: orgId, name: { $in: groupNames } });
    await applyQueryFieldsToGroups(groups, queryFields.groupObjs, args, context);

    var groupsByName = _.keyBy(groups, 'name');
    _.each(subs, (sub)=>{
      sub.groupObjs = _.filter(_.map(sub.groups, (groupName)=>{
        return groupsByName[groupName];
      }));
    });
  }
  if(queryFields.remoteResources || queryFields.rolloutStatus){
    var remoteResources = await models.Resource.find({
      org_id: orgId,
      'searchableData.annotations["deploy_razee_io_clustersubscription"]': { $in: subUuids },
      deleted: false,
    });
    await applyQueryFieldsToResources(remoteResources, queryFields.remoteResources, args, context);

    var remoteResourcesBySubUuid = _.groupBy(remoteResources, (rr)=>{
      return rr.searchableData.get('annotations["deploy_razee_io_clustersubscription"]');
    });
    _.each(subs, (sub)=>{
      var rrs = remoteResourcesBySubUuid[sub.uuid] || [];

      // loops through each resource. if there are errors, increments the errorCount. if no errors, increments successfulCount
      var errorCount = 0;
      var successCount = 0;
      _.each(rrs, (rr)=>{
        var errors = _.toArray(rr.searchableData.get('errors')||[]);
        if(errors.length > 0){
          errorCount += 1;
        }
        else{
          successCount += 1;
        }
      });

      sub.remoteResources = rrs;
      sub.rolloutStatus = {
        successCount,
        errorCount,
      };
    });
  }
};

module.exports = {
  applyQueryFieldsToChannels,
  applyQueryFieldsToClusters,
  applyQueryFieldsToGroups,
  applyQueryFieldsToResources,
  applyQueryFieldsToSubscriptions,
};
