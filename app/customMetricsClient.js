/**
 * Copyright 2023 IBM Corp. All Rights Reserved.
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

const { Counter, Histogram } = require('prom-client');

// Define custom metrics
// Did API action succeed or fail? How long did it take?

// Track how many API calls occur
const apiCallsCounter = new Counter({
  name: 'my_api_calls_total',
  help: 'Total number of API calls'
});
function incrementApiCall() {
  apiCallsCounter.inc();
}

// Cluster Resolver API Metrics
// Track duration and count of clustersByClusterId
const clusterByClusterIdHistogram = new Histogram({
  name: 'cluster_by_cluster_id_duration_seconds',
  help: 'Duration of clusterByClusterId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of clusterByName
const clusterByNameHistogram = new Histogram({
  name: 'cluster_by_name_duration_seconds',
  help: 'Duration of clusterByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of clustersByOrgId
const clustersByOrgIdHistogram = new Histogram({
  name: 'clusters_by_org_id_duration_seconds',
  help: 'Duration of clustersByOrgId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of inactiveClusters
const inactiveClustersHistogram = new Histogram({
  name: 'inactiveClusters_duration_seconds',
  help: 'Duration of inactiveClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of clusterSearch
const clusterSearchHistogram = new Histogram({
  name: 'clusterSearch_duration_seconds',
  help: 'Duration of clusterSearch operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of clusterCountByKubeVersion
const clusterCountByKubeVersionHistogram = new Histogram({
  name: 'clusterCountByKubeVersion_duration_seconds',
  help: 'Duration of clusterCountByKubeVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of deleteClusterByClusterId
const deleteClusterByClusterIdHistogram = new Histogram({
  name: 'deleteClusterByClusterId_duration_seconds',
  help: 'Duration of deleteClusterByClusterId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of deleteClusters
const deleteClustersHistogram = new Histogram({
  name: 'deleteClusters_duration_seconds',
  help: 'Duration of deleteClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of registerCluster
const registerClusterHistogram = new Histogram({
  name: 'registerCluster_duration_seconds',
  help: 'Duration of registerCluster operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of enableRegistrationUrl
const enableRegistrationUrlHistogram = new Histogram({
  name: 'enableRegistrationUrl_duration_seconds',
  help: 'Duration of enableRegistrationUrl operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Channel Resolver API Metrics
// Track duration and count of channels
const channelsHistogram = new Histogram({
  name: 'channels_duration_seconds',
  help: 'Duration of channels operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of channel
const channelHistogram = new Histogram({
  name: 'channel_duration_seconds',
  help: 'Duration of channel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of channelByName
const channelByNameHistogram = new Histogram({
  name: 'channelByName_duration_seconds',
  help: 'Duration of channelByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of channelsByTags
const channelsByTagsHistogram = new Histogram({
  name: 'channelsByTags_duration_seconds',
  help: 'Duration of channelsByTags operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of channelsByVersion
const channelVersionHistogram = new Histogram({
  name: 'channelVersion_duration_seconds',
  help: 'Duration of channelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of addChannel
const addChannelHistogram = new Histogram({
  name: 'addChannel_duration_seconds',
  help: 'Duration of addChannel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of editChannel
const editChannelHistogram = new Histogram({
  name: 'editChannel_duration_seconds',
  help: 'Duration of editChannel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of addChannelVersion
const addChannelVersionHistogram = new Histogram({
  name: 'addChannelVersion_duration_seconds',
  help: 'Duration of addChannelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of editChannelVersion
const editChannelVersionHistogram = new Histogram({
  name: 'editChannelVersion_duration_seconds',
  help: 'Duration of editChannelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of removeChannel
const removeChannelHistogram = new Histogram({
  name: 'removeChannel_duration_seconds',
  help: 'Duration of removeChannel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of removeChannelVersion
const removeChannelVersionHistogram = new Histogram({
  name: 'removeChannelVersion_duration_seconds',
  help: 'Duration of removeChannelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Group Resolver API Metrics
// Track duration and count of groups
const groupsHistogram = new Histogram({
  name: 'groups_duration_seconds',
  help: 'Duration of groups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of group
const groupHistogram = new Histogram({
  name: 'group_duration_seconds',
  help: 'Duration of group operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of groupByName
const groupByNameHistogram = new Histogram({
  name: 'groupByName_duration_seconds',
  help: 'Duration of groupByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of addGroup
const addGroupHistogram = new Histogram({
  name: 'addGroup_duration_seconds',
  help: 'Duration of addGroup operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of removeGroup
const removeGroupHistogram = new Histogram({
  name: 'removeGroup_duration_seconds',
  help: 'Duration of removeGroup operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of removeGroupByName
const removeGroupByNameHistogram = new Histogram({
  name: 'removeGroupByName_duration_seconds',
  help: 'Duration of removeGroupByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of assignClusterGroups
const assignClusterGroupsHistogram = new Histogram({
  name: 'assignClusterGroups_duration_seconds',
  help: 'Duration of assignClusterGroups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of unassignClusterGroups
const unassignClusterGroupsHistogram = new Histogram({
  name: 'unassignClusterGroups_duration_seconds',
  help: 'Duration of unassignClusterGroups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of editClusterGroups
const editClusterGroupsHistogram = new Histogram({
  name: 'editClusterGroups_duration_seconds',
  help: 'Duration of editClusterGroups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of groupClusters
const groupClustersHistogram = new Histogram({
  name: 'groupClusters_duration_seconds',
  help: 'Duration of groupClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of unGroupClusters
const unGroupClustersHistogram = new Histogram({
  name: 'unGroupClusters_duration_seconds',
  help: 'Duration of unGroupClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Subscription Resolver API Metrics
// Track duration and count of subscriptionsByClusterId
const subscriptionsByClusterIdHistogram = new Histogram({
  name: 'subscriptionsByClusterId_duration_seconds',
  help: 'Duration of subscriptionsByClusterId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of subscriptions
const subscriptionsHistogram = new Histogram({
  name: 'subscriptions_duration_seconds',
  help: 'Duration of subscriptions operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of subscription
const subscriptionHistogram = new Histogram({
  name: 'subscription_duration_seconds',
  help: 'Duration of subscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of subscriptionByName
const subscriptionByNameHistogram = new Histogram({
  name: 'subscriptionByName_duration_seconds',
  help: 'Duration of subscriptionByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of subscriptionsForCluster
const subscriptionsForClusterHistogram = new Histogram({
  name: 'subscriptionsForCluster_duration_seconds',
  help: 'Duration of subscriptionsForCluster operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of subscriptionsForClusterByName
const subscriptionsForClusterByNameHistogram = new Histogram({
  name: 'subscriptionsForClusterByName_duration_seconds',
  help: 'Duration of subscriptionsForClusterByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of addSubscription
const addSubscriptionHistogram = new Histogram({
  name: 'addSubscription_duration_seconds',
  help: 'Duration of addSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of editSubscription
const editSubscriptionHistogram = new Histogram({
  name: 'editSubscription_duration_seconds',
  help: 'Duration of editSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of setSubscription
const setSubscriptionHistogram = new Histogram({
  name: 'setSubscription_duration_seconds',
  help: 'Duration of setSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});
// Track duration and count of removeSubscription
const removeSubscriptionHistogram = new Histogram({
  name: 'removeSubscription_duration_seconds',
  help: 'Duration of removeSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

const customMetricsClient = {
  incrementApiCall: incrementApiCall,

  // Cluster Metrics
  clusterByClusterIdDuration: clusterByClusterIdHistogram,
  clusterByNameDuration: clusterByNameHistogram,
  clustersByOrgIdDuration: clustersByOrgIdHistogram,
  inactiveClustersDuration: inactiveClustersHistogram,
  clusterSearchDuration: clusterSearchHistogram,
  clusterCountByKubeVersionDuration: clusterCountByKubeVersionHistogram,
  deleteClusterByClusterIdDuration: deleteClusterByClusterIdHistogram,
  deleteClustersDuration: deleteClustersHistogram,
  registerClusterDuration: registerClusterHistogram,
  enableRegistrationUrlDuration: enableRegistrationUrlHistogram,

  // Channel Resolver API Metrics
  channelsDuration: channelsHistogram,
  channelDuration: channelHistogram,
  channelByNameDuration: channelByNameHistogram,
  channelsByTagsDuration: channelsByTagsHistogram,
  channelVersionDuration: channelVersionHistogram,
  addChannelDuration: addChannelHistogram,
  editChannelDuration: editChannelHistogram,
  addChannelVersionDuration: addChannelVersionHistogram,
  editChannelVersionDuration: editChannelVersionHistogram,
  removeChannelDuration: removeChannelHistogram,
  removeChannelVersionDuration: removeChannelVersionHistogram,

  // Group Resolver API Metrics
  groupsDuration: groupsHistogram,
  groupDuration: groupHistogram,
  groupByNameDuration: groupByNameHistogram,
  addGroupDuration: addGroupHistogram,
  removeGroupDuration: removeGroupHistogram,
  removeGroupByNameDuration: removeGroupByNameHistogram,
  assignClusterGroupsDuration: assignClusterGroupsHistogram,
  unassignClusterGroupsDuration: unassignClusterGroupsHistogram,
  editClusterGroupsDuration: editClusterGroupsHistogram,
  groupClustersDuration: groupClustersHistogram,
  unGroupClustersDuration: unGroupClustersHistogram,

  // Subscription Resolver API Metrics
  subscriptionsByClusterIdDuration: subscriptionsByClusterIdHistogram,
  subscriptionsDuration: subscriptionsHistogram,
  subscriptionDuration: subscriptionHistogram,
  subscriptionByNameDuration: subscriptionByNameHistogram,
  subscriptionsForClusterDuration: subscriptionsForClusterHistogram,
  subscriptionsForClusterByNameDuration: subscriptionsForClusterByNameHistogram,
  addSubscriptionDuration: addSubscriptionHistogram,
  editSubscriptionDuration: editSubscriptionHistogram,
  setSubscriptionDuration: setSubscriptionHistogram,
  removeSubscriptionDuration: removeSubscriptionHistogram,

};

module.exports = {
  customMetricsClient
};
