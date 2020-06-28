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

const ChannelSchema = new mongoose.Schema({
  _id: {
    type: String,
  },
  org_id: {
    type: String,
    alias: "orgId",
  },
  name: {
    type: String,
  },
  uuid: {
    type: String,
  },
  created: {
    type: Date,
    default: Date.now,
  },
  versions: [
    {
      uuid: {
        type: String,
      },
      name: {
        type: String,
      },
      description: {
        type: String,
      },
      location: {
        type: String,
      },
      created: {
        type: Date,
        default: Date.now,
      }
    }
  ],
});

ChannelSchema.index({ org_id: 1 }, { });

module.exports = ChannelSchema;
