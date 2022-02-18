/**
 * Copyright 2022 IBM Corp. All Rights Reserved.
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

/*
TODO/FIXME:
- owner (me._id) vs kubeOwnerId (getKubeOwnerId(context))
- GET updates
- Make API more pluggable, less dependent on `{ cluster_id: string }` with user token api?
*/

const { CLUSTER_IDENTITY_SYNC_STATUS } = require('../models/const');
const { whoIs } = require ('../resolvers/common');
const axios = require('axios');

const applyRbacEndpoint = process.env.APPLY_RBAC_ENDPOINT;

// Utility function: filter array of objects to elements unique by a specified key.
// E.g. unique Cluster objects by `cluster_id`, even if other attributes differ.
const getUniqueArrByKey = ( arr, key ) => {
  return( [ ...new Map( arr.map( item => [ item[key], item ] ) ).values() ] );
};

// RBAC Sync all subscriptions for specified groups
const groupsRbacSync = async( groups, args, context ) => {
  const methodName = 'groupsRbacSync';
  const { resync } = args;
  const { models, me, req_id, logger } = context;

  if( !applyRbacEndpoint ) return;

  if( !groups || groups.length === 0 ) return;
  const org_id = groups[0].org_id;

  try {
    // get all subscriptions using these groups
    const find = { org_id, groups: { $in: groups.map( g => g.uuid ) } };
    const subscriptions = await models.Subscription.find( find );

    // Sync subscriptions
    logger.info( {methodName, req_id, user: whoIs(me), org_id}, `Triggering rbac sync for ${subscriptions.length} subscriptions` );
    await subscriptionsRbacSync( subscriptions, resync, context );

  }
  catch( e ) {
    logger.error( e, `Error triggering rbac sync: ${JSON.stringify({methodName, req_id, user: whoIs(me), org_id})}` );
    logger.error( {methodName, req_id, user: whoIs(me), org_id}, `Error triggering rbac sync: ${e}` );
  }
};

// RBAC Sync specified subscriptions
const subscriptionsRbacSync = async( subscriptions, args, context ) => {
  const methodName = 'subscriptionsRbacSync';
  const { resync } = args;
  const { models, me, req_id, logger } = context;

  if( !applyRbacEndpoint ) return;

  if( !subscriptions || subscriptions.length === 0 ) return;
  const org_id = subscriptions[0].org_id;

  logger.debug( {methodName, req_id, user: whoIs(me), org_id}, `Entry, ${subscriptions.length} subscriptions` );

  try {
    const identityClusters = {};  // { identity: [clusters] }

    for( const subscription of subscriptions ) {
      // Get all Clusters for the Subscription (from the Subscription's Groups)
      const groupUUIDs = subscription.groups;
      const subscriptionClusters = [];
      for( const groupUUID of groupUUIDs ) {
        // This shoud be made more efficient (single Cluster.find with all group UUIDs somehow)
        const groupClusters = await models.Cluster.find( { org_id, groups: { $elemMatch: { uuid: groupUUID } } } ).lean( { virtuals: true } );
        subscriptionClusters.push( ...groupClusters );
        logger.debug( {methodName, req_id, user: whoIs(me), org_id}, `Found clusters for group '${groupUUID}': ${groupClusters.length}` );
      }
      // Remove duplicates of same cluster from multiple groups
      const clusters = getUniqueArrByKey( subscriptionClusters, 'cluster_id' );
      logger.debug( {methodName, req_id, user: whoIs(me), org_id}, `Found ${clusters.length} clusters for subscription '${subscription.name}'/'${subscription.uuid}'` );

      // Identify which clusters will be synced:
      // All clusters where the `syncedIdentities[owner].syncStatus` is not SYNCED, or *all* clusters if `resync: true`
      const clustersToSync = clusters.filter( c =>
        ( resync || ( !c.syncedIdentities || !c.syncedIdentities[ subscription.owner ] || c.syncedIdentities[ subscription.owner ].syncStatus != CLUSTER_IDENTITY_SYNC_STATUS.SYNCED ) )
      );
      logger.info( {methodName, req_id, user: whoIs(me), org_id}, `Found ${clustersToSync.length} clusters requiring rbac sync for subscription '${subscription.name}'/'${subscription.uuid}'` );

      // Add/update clusters to sync for this subscription owner
      if( clustersToSync.length > 0 ) {
        if( !identityClusters[subscription.owner] ) identityClusters[subscription.owner] = [];
        identityClusters[subscription.owner].push( ...clustersToSync );
      }
    }

    const identities = Object.keys(identityClusters);
    for( const identity of identities) {
      const clusters = getUniqueArrByKey( identityClusters[identity], 'cluster_id' );
      logger.info( {methodName, req_id, user: whoIs(me), org_id}, `Total ${clusters.length} clusters requiring rbac sync for identity '${identity}'` );

      // Update the cluster records to set sync status to pending
      const sets = { syncedIdentities: {} };
      sets.syncedIdentities[ identity ] = {
        syncDate: Date.now(),
        syncStatus: CLUSTER_IDENTITY_SYNC_STATUS.PENDING,
        syncMessage: null,
      };
      const find = {
        org_id,
        cluster_id: { $in: clusters.map( c => c.cluster_id ) },
      };
      const dbResponse = await models.Cluster.updateMany( find, { $set: sets } );
      logger.debug( {methodName, req_id, user: whoIs(me), org_id}, `Cluster records updated to await sync for identity '${identity}': ${JSON.stringify(dbResponse)}` );

      // Asynchronously (no `await`) call API to sync the clusters
      for( const cluster of clusters ) {
        applyRBAC( cluster, identity, context ).catch( function( e ) {
          logger.error( e, `applyRBAC error: ${JSON.stringify({methodName, req_id, user: whoIs(me), org_id})}` );
          logger.error( {methodName, req_id, user: whoIs(me), org_id}, `applyRBAC error: ${e}` );
        } );
      }
    }
  }
  catch( e ) {
    logger.error( {methodName, req_id, user: whoIs(me), org_id}, `Error triggering rbac sync: ${e}` );
    logger.error( e, `Error triggering rbac sync: ${JSON.stringify({methodName, req_id, user: whoIs(me), org_id})}` );
  }
};

// Make applyRBAC api call, update cluster record with success or failure
const applyRBAC = async( cluster, identity, context ) => {
  const methodName = 'applyRBAC';
  const { models, me, req_id, logger } = context;

  const org_id = cluster.org_id;
  const cluster_id = cluster.cluster_id;

  // Constants for finding and updating the cluster record later in this function
  const find = { org_id, cluster_id };
  find[`syncedIdentities.${identity}.syncStatus`] = { $nin: [ CLUSTER_IDENTITY_SYNC_STATUS.SYNCED ] };
  const sets = { syncedIdentities: {} };

  if( me._id != identity ) {
    logger.warn( {methodName, req_id, user: whoIs(me), org_id}, `api impossible for cluster '${cluster_id}' (wrong identity)` );
    sets.syncedIdentities[ identity ] = {
      syncDate: Date.now(),
      syncStatus: CLUSTER_IDENTITY_SYNC_STATUS.UNKNOWN,
      syncMessage: 'wrong identity',
    };
  }
  /*
  // This block will never execute as `applyRbacEndpoint` is already checked on function entry to prevent unnecessary processing
  else if( !applyRbacEndpoint ) {
    logger.info( {methodName, req_id, user: whoIs(me), org_id}, `applyRBAC impossible for cluster '${cluster_id}' (no endoint)` );
    sets.syncedIdentities[ identity ] = {
      syncDate: Date.now(),
      syncStatus: CLUSTER_IDENTITY_SYNC_STATUS.UNKNOWN,
      syncMessage: 'no endpoint',
    };
  }
  */
  else {
    try{
      const headers = {
        'authorization': context.req.header('authorization'),
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      const result = await axios.post( applyRbacEndpoint, {
        data: { cluster: cluster_id },
        headers,
      });
      if( result.status === 200 ) {
        logger.info( {methodName, req_id, user: whoIs(me), org_id}, `api success for cluster '${cluster_id}'` );
        sets.syncedIdentities[ identity ] = {
          syncDate: Date.now(),
          syncStatus: CLUSTER_IDENTITY_SYNC_STATUS.SYNCED,
          syncMessage: '',
        };
      }
      else {
        logger.info( {methodName, req_id, user: whoIs(me), org_id}, `api failure for cluster '${cluster_id}'` );
        sets.syncedIdentities[ identity ] = {
          syncDate: Date.now(),
          syncStatus: CLUSTER_IDENTITY_SYNC_STATUS.FAILED,
          syncMessage: JSON.stringify(result.data),
        };
      }
    }
    catch( e ) {
      logger.error( e, `error calling api for cluster '${cluster_id}': ${JSON.stringify({methodName, req_id, user: whoIs(me), org_id})}` );
      logger.error( {methodName, req_id, user: whoIs(me), org_id}, `error calling api for cluster '${cluster_id}': ${e}` );
      sets.syncedIdentities[ identity ] = {
        syncDate: Date.now(),
        syncStatus: CLUSTER_IDENTITY_SYNC_STATUS.UNKNOWN,
        syncMessage: e.message,
      };
    }
  }

  try {
    await models.Cluster.updateOne( find, { $set: sets } );
    logger.info( {methodName, req_id, user: whoIs(me), org_id}, `sync status updated to '${sets.syncedIdentities[ identity ].syncStatus}' for cluster '${cluster_id}'` );
  }
  catch( e ) {
    logger.error( e, `sync update failed for cluster '${cluster.cluster_id}': ${JSON.stringify({methodName, req_id, user: whoIs(me), org_id})}` );
    logger.error( {methodName, req_id, user: whoIs(me), org_id}, `sync status update failed for cluster '${cluster_id}'` );
  }
};

module.exports = {
  subscriptionsRbacSync,
  groupsRbacSync,
};
