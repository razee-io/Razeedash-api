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
const { CLUSTER_REG_STATES } = require('./const');
const ClusterSchema = new mongoose.Schema({
  org_id: {
    type: String,
    alias: 'orgId',
  },
  cluster_id: {
    type: String,
    alias: 'clusterId',
  },
  groups: [
    {
      uuid: {
        type: String,
      },
      name: {
        type: String,
      },
    }
  ],
  metadata: {
    kube_version: {
      major: {
        type: String,
      },
      minor: {
        type: String,
      },
      gitVersion: {
        type: String,
      },
      gitCommit: {
        type: String,
      },
      gitTreeState: {
        type: String,
      },
      buildDate: {
        type: String,
      },
      goVersion: {
        type: String,
      },
      compiler: {
        type: String,
      },
      platform: {
        type: String,
      },
    },
  },
  comments: [
    {
      user_id: {
        type: String,
        alias: 'userId',
      },
      content: {
        type: String,
      },
      created: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  registration: {
    type: Map,
    default: {},
  },
  reg_state: {
    type: String,
    enum: [CLUSTER_REG_STATES.REGISTERING, CLUSTER_REG_STATES.PENDING, CLUSTER_REG_STATES.REGISTERED], 
    default: CLUSTER_REG_STATES.REGISTERING,
    alias: 'regState',
  },

  dirty: {
    type: Boolean,
    default: false,
  },
  created: {
    type: Date,
    default: Date.now,
  },
  updated: {
    type: Date,
    default: Date.now,
  },
}, {
  //strict:'throw',
});

ClusterSchema.index({ org_id: 1, cluster_id: 1 }, { unique: true });

module.exports = ClusterSchema;
