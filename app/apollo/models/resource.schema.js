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

const ResourceSchema = new mongoose.Schema({
  org_id: {
    type: String,
  },
  cluster_id: {
    type: String,
  },
  selfLink: {
    type: String,
  },
  hash: {
    type: String,
  },
  data: {
    type: String,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  searchableData: {
    type: Map,
    default: {},
  },
  searchableDataHash: {
    type: String,
    default: '',
  },
  created: {
    type: Date,
    default: Date.now,
  },
  updated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = ResourceSchema;

