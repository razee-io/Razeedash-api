const { gql } = require('apollo-server-express');

const groupSchema = gql`
  
  type Group {
    uuid: String!
    orgId: String!
    name: String!
    owner: BasicUser!
    created: Date!
  }

  type GroupDetail {
    uuid: String!
    orgId: String!
    name: String!
    owner: BasicUser!
    created: Date!
    clusterCount: Int!
    subscriptionCount: Int!
  }

  type AddGroupReply {
    uuid: String!
  }

  type RemoveGroupReply {
    uuid: String!
    success: Boolean
  }

  type GroupClustersReply {
    modified: Int!
  }

  type UnGroupClustersReply {
    modified: Int!
  }

  extend type Query {
    """
    list all groups for orgId
    """
    groups(orgId: String!): [Group]

    """
    Gets a group detail for orgId and uuid
    """
    group(orgId: String! uuid: String!): GroupDetail

    """
    Gets a group detail for orgId and name
    """
    groupByName(orgId: String! name: String!): GroupDetail
  }

  extend type Mutation {
    """
    Adds a group
    """
    addGroup(orgId: String! name: String!): AddGroupReply!

    """
    Removes a group 
    """
    removeGroup(orgId: String! uuid: String!): RemoveGroupReply!

    """
    Removes a group by name 
    """
    removeGroupByName(orgId: String! name: String!): RemoveGroupReply!

    """
    group a list of clusters
    """
    groupClusters(orgId: String! uuid: String! clusters: [String]!): GroupClustersReply!

    """
    unGroup a list of clusters
    """
    unGroupClusters(orgId: String! uuid: String! clusters: [String]!): UnGroupClustersReply!

  }
`;

module.exports = groupSchema;
