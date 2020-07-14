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

const GroupSchema = new mongoose.Schema({
  _id: {
    type: String,
  },
  org_id: {
    type: String,
    alias: 'orgId',
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
}, {
  strict:'throw',
});


GroupSchema.statics.findOrCreateList = async (models, orgId, groups, context) => {
  const {me, logger} = context;
  logger.debug({groups, orgId, req_id: context.req_id}, 'findOrCreateList enter');

  const groupList = await Promise.all(groups.map(async group => {
    return await models.Group.findOneAndUpdate (
      {org_id: orgId, name: group},
      {_id: UUID(), uuid: UUID(), org_id: orgId, name: group, owner: me._id ? me._id : 'undefined' }, 
      {new: true, upsert: true, setDefaultsOnInsert: true, useFindAndModify: false}).lean();
  }));

  logger.debug({groups, orgId, req_id: context.req_id, groupList}, 'findOrCreateList exit');
  return groupList;
};

GroupSchema.index({ org_id: 1 }, { });

module.exports = GroupSchema;
