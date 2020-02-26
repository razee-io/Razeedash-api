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

const userResolvers = {
  Query: {
    me: async (parent, args, { models, me , req_id, logger }) => {
      if (!me) {
        logger.debug(`There is no user information on this context for the request ${req_id}`);
        return null;
      }
      // TODO: we probably skip database query and directly return user info from
      // JWT token.
      let result = await models.User.findOne({ _id: me._id });
      if (result != null) {
        result = {
          type: result.type,
          id: result.getId(),
          email: result.getEmail(),
          identifier: typeof result.getIdentifier === 'function' ? result.getIdentifier() : null, 
          org_id: result.getCurrentOrgId(),
          role: result.getCurrentRole(),
          meta: result.getMeta(),
        };
      } else {
        logger.debug(`Can not locate the user for the user _id: ${me._id} for the request ${req_id}`);
      }
      return result;
    },
  },

  Mutation: {
    signUp: async (parent, args, context) => {
      const { models, secret } = context;
      return models.User.signUp(models, args, secret, context);
    },

    signIn: async (parent, { login, password }, context) => {
      const { models, secret } = context;
      return models.User.signIn(models, login, password, secret, context);
    },
  },
};

module.exports = userResolvers;
