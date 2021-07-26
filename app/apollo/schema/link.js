const { gql } = require('apollo-server-express');

const linkSchema = gql`

  # The string validator @sv(min: Int, max: Int) on any input field will check for min and max length and illegal characters.
  # if you just provide @sv it will just check for allowed characters and assume default min and max lengths of 1 and 256
  # @jv is the json validator
  directive @sv(min: Int, max: Int) on ARGUMENT_DEFINITION
  directive @jv on ARGUMENT_DEFINITION

  scalar Date
  scalar DateTime
  scalar JSON

  type Query {
    _: Boolean
  }

  type Mutation {
    _: Boolean
  }

  type Subscription {
    _: Boolean
  }

  input SortObj {
    field: String!
    desc: Boolean = false
  }

  input MongoQueries {
    resources: JSON

    #we'll enable these ones later
    # clusters: JSON
    # channels: JSON
    # groups: JSON
    # orgs: JSON
    # subscriptions: JSON
  }
`;

module.exports = linkSchema;
