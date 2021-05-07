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

'use strict'

const { models } = require('../models');
const { v4: UUID } = require('uuid');
const ObjectId = require('mongoose').Types.ObjectId;

const createTestData = async () => {
    const org01Data = {
        "type": "local",
        "name": "org_01"
    };
    const org01 = await models.Organization.createLocalOrg(org01Data);

    const org2Data = {
        "type": "local",
        "name": "org_2"
    };
    const org02 = await models.Organization.createLocalOrg(org2Data);

    const user01Data = {
        "username": "user01",
        "email": "user01@us.ibm.com",
        "password": "password123",
        "orgName": "org_01",
        "role": "ADMIN"
    };
    const user01 = await models.User.createUser(models, user01Data);

    const user02Data = {
        "username": "user02",
        "email": "user02@us.ibm.com",
        "password": "password123",
        "orgName": "org_02",
        "role": "ADMIN"
    };
    const user02 = await models.User.createUser(models, user02Data);

    const channelData = {
        _id: UUID(),
        org_id: org01._id,
        uuid: UUID(),
        name: "channel_01_name",
        versions: [
            {
                uuid: UUID(),
                name: "channelVersion_01_name"
            },
            {
                uuid: UUID(),
                name: "channelVersion_02_name"
            }
        ]
    }
    await models.Channel.create(channelData);

    const versionData = {
        _id: UUID(),
        org_id: org01._id,
        uuid: channelData.versions[0].uuid,
        channel_id: channelData.uuid,
        channel_name: channelData.name,
        name: "v1"
    }
    await models.DeployableVersion.create(versionData);

    // Cluster 1 is in org01
    const cluster1Data = {
        org_id: org01._id,
        cluster_id: 'cluster_01',
        metadata: {
            kube_version: {
                major: '1',
                minor: '16',
                gitVersion: '1.99',
                gitCommit: 'abc',
                gitTreeState: 'def',
                buildDate: 'a_date',
                goVersion: '1.88',
                compiler: 'some compiler',
                platform: 'linux/amd64',
            },
        },
        registration: { name: 'cluster-1' }
    }
    await models.Cluster.create(cluster1Data);

    // Cluster 2 is in org02
    const cluster2Data = {
        org_id: org02._id,
        cluster_id: 'cluster_02',
        metadata: {
            kube_version: {
                major: '1',
                minor: '16',
                gitVersion: '1.99',
                gitCommit: 'abc',
                gitTreeState: 'def',
                buildDate: 'a_date',
                goVersion: '1.88',
                compiler: 'some compiler',
                platform: 'linux/amd64',
            },
        },
        registration: { name: 'cluster-2' }
    }
    await models.Cluster.create(cluster2Data);

    // Service subscription
    const ssid1 = UUID();
    const serSub1 = await models.ServiceSubscription.create({
        _id: ssid1,
        org_id: org01._id,
        uuid: ssid1,
        name: 'service_subscription_01_name',
        owner: user02._id,
        clusterId: cluster2Data.cluster_id,
        channel_uuid: channelData.uuid,
        channelName: channelData.name,
        version: channelData.versions[0].name,
        version_uuid: channelData.versions[0].uuid // 1st version
    });

    // User subscription
    const userSub1 = await models.Subscription.create({
        _id: 'user-subscription-id-1',
        org_id: org01._id,
        uuid: UUID(),
        name: "subscription_01_name",
        owner: user01._id,
        clusterId: cluster2Data.cluster_id,
        channel_uuid: channelData.uuid,
        channel: channelData.name,
        version: channelData.versions[1].name,
        version_uuid: channelData.versions[1].uuid // 2nd version
    });

    const resource = await models.Resource.create({
        _id: new ObjectId('aaaabbbbccccddddeeeeffff'),
        org_id: org02._id,
        cluster_id: cluster2Data.cluster_id,
        selfLink: 'any_selfLink',
        hash: 'any_hash',
        deleted: false,
        data: 'any_data',
        searchableData: { 'annotations["deploy_razee_io_clustersubscription"]': serSub1.uuid, key02: 'value-02' },
        searchableDataHash: 'some random hash',
    });
//searchableData.
    console.log(`\t Created service subscriptions test data`);

    return { org01, channelData, cluster2Data: cluster2Data, serSub1, userSub1 }
}

module.exports = createTestData;