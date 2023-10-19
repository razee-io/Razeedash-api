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

const customMetricsClient = {
  incrementApiCall: incrementApiCall,
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
};

module.exports = {
  customMetricsClient
};
