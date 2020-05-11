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
    me: async (parent, args, context) => {
      const { models, me , req_id, logger } = context;
      if (!me) {
        logger.debug(`There is no user information on this context for the request ${req_id}`);
        return null;
      }

      return models.User.getCurrentUser(context);
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
