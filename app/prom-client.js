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


const prom_client = require('prom-client');

var client = {

  queSignIn: new prom_client.Gauge({ name: 'razee_signIn_api_requests_queue_count', help: 'signIn http requests in queue' }),
  respSignIn: new prom_client.Histogram({ name: 'razee_signIn_api_responsetime', help: 'response time of signIn api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }), //histogram

  queMe: new prom_client.Gauge({ name: 'razee_me_api_requests_queue_count', help: 'me http requests in queue' }),
  respMe: new prom_client.Histogram({ name: 'razee_me_api_responsetime', help: 'response time of me api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queRegUrl: new prom_client.Gauge({ name: 'razee_registrationUrl_api_requests_queue_count', help: 'registrationUrl http requests in queue' }),
  respRegUrl: new prom_client.Histogram({ name: 'razee_registrationUrl_api_responsetime', help: 'response time of registrationUrl api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queOrgs: new prom_client.Gauge({ name: 'razee_organizations_api_requests_queue_count', help: 'organizations http requests in queue' }),
  respOrgs: new prom_client.Histogram({ name: 'razee_organizations_api_responsetime', help: 'response time of organizations api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterByClusterID: new prom_client.Gauge({ name: 'razee_clusterByClusterID_api_requests_queue_count', help: 'clusterByClusterID http requests in queue' }),
  respClusterByClusterID: new prom_client.Histogram({ name: 'razee_clusterByClusterID_api_responsetime', help: 'response time of clusterByClusterID api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClustersByOrgID: new prom_client.Gauge({ name: 'razee_clustersByOrgID_api_requests_queue_count', help: 'clustersByOrgID http requests in queue' }),
  respClustersByOrgID: new prom_client.Histogram({ name: 'razee_clustersByOrgID_api_responsetime', help: 'response time of clustersByOrgID api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterZombies: new prom_client.Gauge({ name: 'razee_clusterZombies_api_requests_queue_count', help: 'clusterZombies http requests in queue' }),
  respClusterZombies: new prom_client.Histogram({ name: 'razee_clusterZombies_api_responsetime', help: 'response time of clusterZombies api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterSearch: new prom_client.Gauge({ name: 'razee_clusterSearch_api_requests_queue_count', help: 'clusterSearch http requests in queue' }),
  respClusterSearch: new prom_client.Histogram({ name: 'razee_clusterSearch_api_responsetime', help: 'response time of clusterSearch api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterCountByKubeVersion: new prom_client.Gauge({ name: 'razee_clusterCountByKubeVersion_api_requests_queue_count', help: 'clusterCountByKubeVersion http requests in queue' }),
  respClusterCountByKubeVersion: new prom_client.Histogram({ name: 'razee_ClusterCountByKubeVersion_api_responsetime', help: 'response time of clusterCountByKubeVersion api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterDistributedByClusterID: new prom_client.Gauge({ name: 'razee_clusterDistributedByClusterID_api_requests_queue_count', help: 'clusterDistributedByClusterID http requests in queue' }),
  respClusterDistributedByClusterID: new prom_client.Histogram({ name: 'razee_clusterDistributedByClusterID_api_responsetime', help: 'response time of clusterDistributedByClusterID api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClustersDistributedByOrgID: new prom_client.Gauge({ name: 'razee_clustersDistributedByOrgID_api_requests_queue_count', help: 'clustersDistributedByOrgID http requests in queue' }),
  respClustersDistributedByOrgID: new prom_client.Histogram({ name: 'razee_clustersDistributedByOrgID_api_responsetime', help: 'response time of clustersDistributedByOrgID api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterDistributedZombies: new prom_client.Gauge({ name: 'razee_clusterDistributedZombies_api_requests_queue_count', help: 'clusterDistributedZombies http requests in queue' }),
  respClusterDistributedZombies: new prom_client.Histogram({ name: 'razee_clusterDistributedZombies_api_responsetime', help: 'response time of clusterDistributedZombies api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterDistributedSearch: new prom_client.Gauge({ name: 'razee_clusterDistributedSearch_api_requests_queue_count', help: 'clusterDistributedSearch http requests in queue' }),
  respClusterDistributedSearch: new prom_client.Histogram({ name: 'razee_clusterDistributedSearch_api_responsetime', help: 'response time of clusterDistributedSearch api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterDistributedCountByKubeVersion: new prom_client.Gauge({ name: 'razee_clusterDistributedCountByKubeVersion_api_requests_queue_count', help: 'clusterDistributedCountByKubeVersion http requests in queue' }),
  respClusterDistributedCountByKubeVersion: new prom_client.Histogram({ name: 'razee_clusterDistributedCountByKubeVersion_api_responsetime', help: 'response time of clusterDistributedCountByKubeVersion api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourcesCount: new prom_client.Gauge({ name: 'razee_resourcesCount_api_requests_queue_count', help: 'resourcesCount http requests in queue' }),
  respResourcesCount: new prom_client.Histogram({ name: 'razee_resourcesCount_api_responsetime', help: 'response time of resourcesCount api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResources: new prom_client.Gauge({ name: 'razee_resources_api_requests_queue_count', help: 'Resources http requests in queue' }),
  respResources: new prom_client.Histogram({ name: 'razee_resources_api_responsetime', help: 'response time of Resources api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourcesByCluster: new prom_client.Gauge({ name: 'razee_resourcesByCluster_api_requests_queue_count', help: 'resourcesByCluster http requests in queue' }),
  respResourcesByCluster: new prom_client.Histogram({ name: 'razee_resourcesByCluster_api_responsetime', help: 'response time of resourcesByCluster api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResource: new prom_client.Gauge({ name: 'razee_resource_api_requests_queue_count', help: 'resource http requests in queue' }),
  respResource: new prom_client.Histogram({ name: 'razee_resource_api_responsetime', help: 'response time of resource api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourceByKeys: new prom_client.Gauge({ name: 'razee_resourceByKeys_api_requests_queue_count', help: 'resourceByKeys http requests in queue' }),
  respResourceByKeys: new prom_client.Histogram({ name: 'razee_resourceByKeys_api_responsetime', help: 'response time of resourceByKeys api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourcesDistributedCount: new prom_client.Gauge({ name: 'razee_resourcesDistributedCount_api_requests_queue_count', help: 'resourcesDistributedCount http requests in queue' }),
  respResourcesDistributedCount: new prom_client.Histogram({ name: 'razee_resourcesDistributedCount_api_responsetime', help: 'response time of resourcesDistributedCount api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourcesDistributed: new prom_client.Gauge({ name: 'razee_resourcesDistributed_api_requests_queue_count', help: 'resourcesDistributed http requests in queue' }),
  respResourcesDistributed: new prom_client.Histogram({ name: 'razee_resourcesDistributed_api_responsetime', help: 'response time of resourcesDistributed api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourcesDistributedByCluster: new prom_client.Gauge({ name: 'razee_resourcesDistributedByCluster_api_requests_queue_count', help: 'resourcesDistributedByCluster http requests in queue' }),
  respResourcesDistributedByCluster: new prom_client.Histogram({ name: 'razee_resourcesDistributedByCluster_api_responsetime', help: 'response time of resourcesDistributedByCluster api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourceDistributed: new prom_client.Gauge({ name: 'razee_resourceDistributed_api_requests_queue_count', help: 'resourceDistributed http requests in queue' }),
  respResourceDistributed: new prom_client.Histogram({ name: 'razee_resourceDistributed_api_responsetime', help: 'response time of resourceDistributed api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourceDistributedByKeys: new prom_client.Gauge({ name: 'razee_resourceDistributedByKeys_api_requests_queue_count', help: 'resourceDistributedByKeys http requests in queue' }),
  respResourceDistributedByKeys: new prom_client.Histogram({ name: 'razee_resourceDistributedByKeys_api_responsetime', help: 'response time of resourceDistributedByKeys api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queAddUpdateCluster: new prom_client.Gauge({ name: 'razee_addUpdateCluster_api_requests_queue_count', help: 'addUpdateCluster http requests in queue' }),
  respAddUpdateCluster: new prom_client.Histogram({ name: 'razee_addUpdateCluster_api_responsetime', help: 'response time of addUpdateCluster api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queUpdateClusterResources: new prom_client.Gauge({ name: 'razee_updateClusterResources_api_requests_queue_count', help: 'updateClusterResources http requests in queue' }),
  respUpdateClusterResources: new prom_client.Histogram({ name: 'razee_updateClusterResources_api_responsetime', help: 'response time of updateClusterResources api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queSyncClusterResources: new prom_client.Gauge({ name: 'razee_syncClusterResources_api_requests_queue_count', help: 'syncClusterResources http requests in queue' }),
  respSyncClusterResources: new prom_client.Histogram({ name: 'razee_syncClusterResources_api_responsetime', help: 'response time of syncClusterResources api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queAddClusterMessages: new prom_client.Gauge({ name: 'razee_addClusterMessages_api_requests_queue_count', help: 'addClusterMessages http requests in queue' }),
  respAddClusterMessages: new prom_client.Histogram({ name: 'razee_addClusterMessages_api_responsetime', help: 'response time of addClusterMessages api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queGetClusters: new prom_client.Gauge({ name: 'razee_getClusters_api_requests_queue_count', help: 'getClusters http requests in queue' }),
  respGetClusters: new prom_client.Histogram({ name: 'razee_getClusters_api_responsetime', help: 'response time of getClusters api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queClusterDetails: new prom_client.Gauge({ name: 'razee_clusterDetails_api_requests_queue_count', help: 'clusterDetails http requests in queue' }),
  respClusterDetails: new prom_client.Histogram({ name: 'razee_clusterDetails_api_responsetime', help: 'response time of clusterDetails api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queDeleteResource: new prom_client.Gauge({ name: 'razee_deleteResource_api_requests_queue_count', help: 'deleteResource http requests in queue' }),
  respDeleteResource: new prom_client.Histogram({ name: 'razee_deleteResource_api_responsetime', help: 'response time of deleteResource api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queCreateOrg: new prom_client.Gauge({ name: 'razee_createOrg_api_requests_queue_count', help: 'createOrg http requests in queue' }),
  respCreateOrg: new prom_client.Histogram({ name: 'razee_createOrg_api_responsetime', help: 'response time of createOrg api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queGetOrgs: new prom_client.Gauge({ name: 'razee_getOrgs_api_requests_queue_count', help: 'getOrgs http requests in queue' }),
  respGetOrgs: new prom_client.Histogram({ name: 'razee_getOrgs_api_responsetime', help: 'response time of getOrgs api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queUpdateOrg: new prom_client.Gauge({ name: 'razee_updateOrg_api_requests_queue_count', help: 'updateOrg http requests in queue' }),
  respUpdateOrg: new prom_client.Histogram({ name: 'razee_updateOrg_api_responsetime', help: 'response time of updateOrg api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queDeleteOrg: new prom_client.Gauge({ name: 'razee_deleteOrg_api_requests_queue_count', help: 'deleteOrg http requests in queue' }),
  respDeleteOrg: new prom_client.Histogram({ name: 'razee_deleteOrg_api_responsetime', help: 'response time of deleteOrg api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queGetResources: new prom_client.Gauge({ name: 'razee_getResources_api_requests_queue_count', help: 'getResources http requests in queue' }),
  respGetResources: new prom_client.Histogram({ name: 'razee_getResources_api_responsetime', help: 'response time of getResources api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queAddCallbackResult: new prom_client.Gauge({ name: 'razee_addCallbackResult_api_requests_queue_count', help: 'addCallbackResult http requests in queue' }),
  respAddCallbackResult: new prom_client.Histogram({ name: 'razee_addCallbackResult_api_responsetime', help: 'response time of addCallbackResult api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queAddWebhook: new prom_client.Gauge({ name: 'razee_addWebhook_api_requests_queue_count', help: 'addWebhook http requests in queue' }),
  respAddWebhook: new prom_client.Histogram({ name: 'razee_addWebhook_api_responsetime', help: 'response time of addWebhook api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queDeleteWebhook: new prom_client.Gauge({ name: 'razee_deleteWebhook_api_requests_queue_count', help: 'deleteWebhook http requests in queue' }),
  respDeleteWebhook: new prom_client.Histogram({ name: 'razee_deleteWebhook_api_responsetime', help: 'response time of deleteWebhook api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

  queResourceUpdated: new prom_client.Gauge({ name: 'razee_resourceUpdated_requests_queue_count', help: 'resourceUpdated http requests in queue' }),
  respResourceUpdated: new prom_client.Histogram({ name: 'razee_resourceUpdated_responsetime', help: 'response time of resourceUpdated api', labelNames: ['StatusCode'], buckets: [ 0.01, 0.05, 0.1, 0.25, 0.5, 1] }),  //histogram

}

module.exports = client;
