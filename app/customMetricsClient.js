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

const { Counter, Gauge, Histogram } = require('prom-client');
// --- Define Custom API Metrics ---

// --- Other API Action Metrics ---
// Count how many API calls occur
const signInHistogram = new Histogram({
  name: 'sign_in_duration_seconds',
  help: 'Duration of signIn operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

const apiCallsCounter = new Counter({
  name: 'my_api_calls_total',
  help: 'Total number of API calls'
});

// Gauge success and failure of signIn
const signInGauge = new Gauge({
  name: 'sign_in_result_status',
  help: 'Total number of signIn operations, labeled by success or failure',
  labelNames: ['status'],
});

// --- Cluster Resolver API Metrics ---
// Count duration of clustersByClusterId
const clusterByClusterIdHistogram = new Histogram({
  name: 'cluster_by_cluster_id_duration_seconds',
  help: 'Duration of clusterByClusterId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Gauge success and failure of clustersByClusterId
const clusterByClusterIdGauge = new Gauge({
  name: 'cluster_by_cluster_id_gauge',
  help: 'Total number of clusterByClusterId operations, labeled by success or failure',
  labelNames: ['status'],
});

// Count duration of clusterByName
const clusterByNameHistogram = new Histogram({
  name: 'cluster_by_name_duration_seconds',
  help: 'Duration of clusterByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Gauge success and failure of clustersByClusterId
const clusterByNameGauge = new Gauge({
  name: 'cluster_by_name_gauge',
  help: 'Total number of clusterByName operations, labeled by success or failure',
  labelNames: ['status'],
});

// Count duration of clustersByOrgId
const clustersByOrgIdHistogram = new Histogram({
  name: 'clusters_by_org_id_duration_seconds',
  help: 'Duration of clustersByOrgId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of inactiveClusters
const inactiveClustersHistogram = new Histogram({
  name: 'inactive_clusters_duration_seconds',
  help: 'Duration of inactiveClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of clusterSearch
const clusterSearchHistogram = new Histogram({
  name: 'cluster_search_duration_seconds',
  help: 'Duration of clusterSearch operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of clusterCountByKubeVersion
const clusterCountByKubeVersionHistogram = new Histogram({
  name: 'cluster_count_by_kube_version_duration_seconds',
  help: 'Duration of clusterCountByKubeVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of deleteClusterByClusterId
const deleteClusterByClusterIdHistogram = new Histogram({
  name: 'delete_cluster_by_cluster_id_duration_seconds',
  help: 'Duration of deleteClusterByClusterId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of deleteClusters
const deleteClustersHistogram = new Histogram({
  name: 'delete_clusters_duration_seconds',
  help: 'Duration of deleteClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of registerCluster
const registerClusterHistogram = new Histogram({
  name: 'register_cluster_duration_seconds',
  help: 'Duration of registerCluster operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of enableRegistrationUrl
const enableRegistrationUrlHistogram = new Histogram({
  name: 'enable_registration_url_duration_seconds',
  help: 'Duration of enableRegistrationUrl operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Channel Resolver API Metrics
// Count duration of channels
const channelsHistogram = new Histogram({
  name: 'channels_duration_seconds',
  help: 'Duration of channels operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of channel
const channelHistogram = new Histogram({
  name: 'channel_duration_seconds',
  help: 'Duration of channel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of channelByName
const channelByNameHistogram = new Histogram({
  name: 'channel_by_name_duration_seconds',
  help: 'Duration of channelByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of channelsByTags
const channelsByTagsHistogram = new Histogram({
  name: 'channels_by_tags_duration_seconds',
  help: 'Duration of channelsByTags operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of channelsByVersion
const channelVersionHistogram = new Histogram({
  name: 'channel_version_duration_seconds',
  help: 'Duration of channelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of addChannel
const addChannelHistogram = new Histogram({
  name: 'add_channel_duration_seconds',
  help: 'Duration of addChannel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of editChannel
const editChannelHistogram = new Histogram({
  name: 'edit_channel_duration_seconds',
  help: 'Duration of editChannel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of addChannelVersion
const addChannelVersionHistogram = new Histogram({
  name: 'add_channel_version_duration_seconds',
  help: 'Duration of addChannelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of editChannelVersion
const editChannelVersionHistogram = new Histogram({
  name: 'edit_channel_version_duration_seconds',
  help: 'Duration of editChannelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of removeChannel
const removeChannelHistogram = new Histogram({
  name: 'remove_channel_duration_seconds',
  help: 'Duration of removeChannel operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of removeChannelVersion
const removeChannelVersionHistogram = new Histogram({
  name: 'remove_channel_version_duration_seconds',
  help: 'Duration of removeChannelVersion operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Group Resolver API Metrics
// Count duration of groups
const groupsHistogram = new Histogram({
  name: 'groups_duration_seconds',
  help: 'Duration of groups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of group
const groupHistogram = new Histogram({
  name: 'group_duration_seconds',
  help: 'Duration of group operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of groupByName
const groupByNameHistogram = new Histogram({
  name: 'group_by_name_duration_seconds',
  help: 'Duration of groupByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of addGroup
const addGroupHistogram = new Histogram({
  name: 'add_group_duration_seconds',
  help: 'Duration of addGroup operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of removeGroup
const removeGroupHistogram = new Histogram({
  name: 'remove_group_duration_seconds',
  help: 'Duration of removeGroup operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of removeGroupByName
const removeGroupByNameHistogram = new Histogram({
  name: 'remove_group_by_name_duration_seconds',
  help: 'Duration of removeGroupByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of assignClusterGroups
const assignClusterGroupsHistogram = new Histogram({
  name: 'assign_cluster_groups_duration_seconds',
  help: 'Duration of assignClusterGroups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of unassignClusterGroups
const unassignClusterGroupsHistogram = new Histogram({
  name: 'unassign_cluster_groups_duration_seconds',
  help: 'Duration of unassignClusterGroups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of editClusterGroups
const editClusterGroupsHistogram = new Histogram({
  name: 'edit_cluster_groups_duration_seconds',
  help: 'Duration of editClusterGroups operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of groupClusters
const groupClustersHistogram = new Histogram({
  name: 'group_clusters_duration_seconds',
  help: 'Duration of groupClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of unGroupClusters
const unGroupClustersHistogram = new Histogram({
  name: 'ungroup_clusters_duration_seconds',
  help: 'Duration of unGroupClusters operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Subscription Resolver API Metrics
// Count duration of subscriptionsByClusterId
const subscriptionsByClusterIdHistogram = new Histogram({
  name: 'subscriptions_by_cluster_id_duration_seconds',
  help: 'Duration of subscriptionsByClusterId operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of subscriptions
const subscriptionsHistogram = new Histogram({
  name: 'subscriptions_duration_seconds',
  help: 'Duration of subscriptions operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of subscription
const subscriptionHistogram = new Histogram({
  name: 'subscription_duration_seconds',
  help: 'Duration of subscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of subscriptionByName
const subscriptionByNameHistogram = new Histogram({
  name: 'subscription_by_name_duration_seconds',
  help: 'Duration of subscriptionByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of subscriptionsForCluster
const subscriptionsForClusterHistogram = new Histogram({
  name: 'subscriptions_for_cluster_duration_seconds',
  help: 'Duration of subscriptionsForCluster operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of subscriptionsForClusterByName
const subscriptionsForClusterByNameHistogram = new Histogram({
  name: 'subscriptions_for_cluster_by_name_duration_seconds',
  help: 'Duration of subscriptionsForClusterByName operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of addSubscription
const addSubscriptionHistogram = new Histogram({
  name: 'add_subscription_duration_seconds',
  help: 'Duration of addSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of editSubscription
const editSubscriptionHistogram = new Histogram({
  name: 'edit_subscription_duration_seconds',
  help: 'Duration of editSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of setSubscription
const setSubscriptionHistogram = new Histogram({
  name: 'set_subscription_duration_seconds',
  help: 'Duration of setSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Count duration of removeSubscription
const removeSubscriptionHistogram = new Histogram({
  name: 'remove_subscription_duration_seconds',
  help: 'Duration of removeSubscription operations in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// --- Helper Functions ---
// Increment each API call
function incrementApiCall() {
  apiCallsCounter.inc();
}

// Define exportable list of metrics
const customMetricsClient = {
  // Other API Metrics
  signInDuration: signInHistogram,
  signInGauge: signInGauge,

  // Cluster Resolver API Metrics
  clusterByClusterIdDuration: clusterByClusterIdHistogram,
  clusterByClusterIdGauge: clusterByClusterIdGauge,

  clusterByNameDuration: clusterByNameHistogram,
  clusterByNameGauge: clusterByNameGauge,

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

  // Helper Functions
  incrementApiCall: incrementApiCall,
};

module.exports = {
  customMetricsClient
};
