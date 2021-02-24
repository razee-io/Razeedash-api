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

const mongoose = require('mongoose');

const DeployableVersionSchema = new mongoose.Schema({
  _id: {
    type: String,
  },
  org_id: {
    type: String,
    alias: 'orgId',
  },
  channel_id: {
    type: String,
    alias: 'channelId',
  },
  channel_name: {
    type: String,
    alias: 'channelName',
  },
  name: {
    type: String,
  },
  description: {
    type: String,
  },
  uuid: {
    type: String,
  },
  content: {
    type: String,
  },
  iv: {
    type: String,
  },
  location: {
    type: String,
  },
  type: {
    type: String,
  },
  ownerId: {
    type: String,
  },
  kubeOwnerName: {
    type: String,
  },
  created: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'deployableVersions',
  strict: 'throw',
});

DeployableVersionSchema.index({ org_id: 1 }, { });

module.exports = DeployableVersionSchema;
