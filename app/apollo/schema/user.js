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

const { gql } = require('apollo-server-express');

const userSchema = gql`
  extend type Query {
    """
    Returns the current user information based on user's bearer token.
    """
    me: User
  }

  extend type Mutation {
    """
    Only enabled and used for local development
    """
    signUp(
      username: String!
      email: String!
      password: String!
      org_name: String
      role: String
    ): Token!

    """
    Only enabled and used for local development
    """
    signIn(login: String!, password: String!): Token!
  }

  type Token {
    token: String!
  }

  # used by ui to get basic user information after Sign-in
  # including id, type of the user, email, default org_id
  # and other meta data about this user.
  type User {
    id: ID!
    type: String!
    org_id: String!
    identifier: String
    email: String
    role: String
    meta: JSON
  }
`;

module.exports = userSchema;