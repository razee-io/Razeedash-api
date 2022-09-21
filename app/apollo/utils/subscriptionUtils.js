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

const { whoIs, RazeeValidationError } = require ('../resolvers/common');
const { SUBSCRIPTION_LIMITS } = require('../models/const');

const validateGroups = async ( org_id, groups, context ) => {
  const { req_id, me, models, logger } = context;
  // validate cluster groups exists in the groups db
  let groupCount = await models.Group.count({org_id: org_id, name: {$in: groups} });
  if (groupCount < groups.length) {
    if (process.env.LABEL_VALIDATION_REQUIRED) {
      throw new RazeeValidationError(context.req.t('Could not find all the cluster groups {{groups}} in the groups database, please create them first.', {'groups':groups}), context);
    } else {
      // in migration period, we automatically populate groups into label db
      logger.info({req_id, user: whoIs(me), org_id}, `could not find all the cluster groups ${groups}, migrate them into label database.`);
      await models.Group.findOrCreateList(models, org_id, groups, context);
      groupCount = await models.Group.count({org_id: org_id, name: {$in: groups} });
    }
  }
};

// validate the number of total subscriptions are under the limit
const validateSubscriptionLimit = async ( org_id, newCount, context ) => {
  const { req_id, me, models, logger } = context;
  const total = await models.Subscription.count({org_id});
  if( total+newCount > SUBSCRIPTION_LIMITS.MAX_TOTAL ) {
    throw new RazeeValidationError(context.req.t('Too many subscriptions are registered under {{org_id}}.', {'org_id':org_id}), context);
  }
};

module.exports = {
  validateGroups,
  validateSubscriptionLimit,
};
