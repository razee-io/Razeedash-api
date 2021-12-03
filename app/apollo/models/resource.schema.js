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
const ObjectId = require('mongoose').Types.ObjectId;

const ResourceSchema = new mongoose.Schema({
  _id: {
    type: ObjectId,
    alias: 'id',
  },
  org_id: {
    type: String,
    alias: 'orgId',
  },
  cluster_id: {
    type: String,
    alias: 'clusterId',
  },
  selfLink: {
    type: String,
    default: '',
  },
  hash: {
    type: String,
  },
  data: mongoose.Schema.Types.Mixed,
  deleted: {
    type: Boolean,
    default: false,
  },
  searchableData: {
    type: Object,
    default: {},
  },
  searchableDataHash: {
    type: String,
    default: '',
  },
  searchableDataHist: {
    type: Object,
    default: {},
  },
  histId: {
    type: String,
  },
  created: {
    type: Date,
    default: Date.now,
  },
  updated: {
    type: Date,
    default: Date.now,
  },
  lastModified: {
    type: Date,
    default: Date.now,
  },
}, {
  strict:'throw',
});

ResourceSchema.statics.getIds = async(ids)=>{
  return await this.find({ _id: { $in: ids } });
};
ResourceSchema.statics.getByClusterIds = async(clusterIds)=>{
  return await this.find({ cluster_id: { $in: clusterIds } });
};
ResourceSchema.index({ cluster_id: 'text', selfLink: 'text', 'searchableData.searchableExpression': 'text' });

module.exports = ResourceSchema;

