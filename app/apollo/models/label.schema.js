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

const { v4: UUID } = require('uuid');
const mongoose = require('mongoose');

const LabelSchema = new mongoose.Schema({
  _id: {
    type: String,
  },
  orgId: {
    type: String,
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
  owner: {
    type: String,
  },
});


LabelSchema.statics.findOrCreateList = async (models, orgId, tags, context) => {
  const {me, logger} = context;
  logger.debug({tags, orgId, req_id: context.req_id}, 'findOrCreateList enter');

  const labels = await Promise.all(tags.map(async tag => {
    return await models.Label.findOneAndUpdate (
      {orgId, name: tag},
      {_id: UUID(), uuid: UUID(), orgId, name: tag, owner: me._id ? me._id : 'undefined' }, 
      {new: true, upsert: true, setDefaultsOnInsert: true, useFindAndModify: false}).lean();
  }));

  logger.debug({tags, orgId, req_id: context.req_id, labels}, 'findOrCreateList exit');
  return labels;
};

LabelSchema.index({ orgId: 1 }, { });

module.exports = LabelSchema;