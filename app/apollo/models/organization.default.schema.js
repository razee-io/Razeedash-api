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
const { v4: uuid } = require('uuid');
const OrganizationDefaultSchema = new mongoose.Schema({
  _id: {
    type: String,
  },
  name: {
    type: String,
  },
  creatorUserId: {
    type: String,
  },
  gheOrgId: {
    type: String,
  },
  orgKeys: [
    {
      type: String,
    },
  ],
  created: {
    type: Date,
    default: Date.now,
  },
  updated: {
    type: Date,
    default: Date.now,
  },
});

OrganizationDefaultSchema.statics.getRegistrationUrl = async function(org_id, context) {
  context.logger.debug({org_id}, 'getRegistrationUrl enter');
  const org = await this.findById(org_id);
  const protocol = context.req ? context.req.protocol : 'http';
  const host = context.req ? context.req.header('host') : 'localhost:3333';
  return {
    url: `${protocol}://${host}/api/install/razeedeploy-job?orgKey=${org.orgKeys[0]}`,
  }; 
};

OrganizationDefaultSchema.statics.createLocalOrg = async function(args) {
  let org = await this.findOne({
    name: args.name,
  });

  if (!org) {
    const _id = args._id ? args._id : uuid();
    const orgKey = 'orgApiKey-'+uuid();
    org = await this.create({ ...args, _id, orgKeys: [orgKey] });
  }
  return org;
};

module.exports = OrganizationDefaultSchema;
