const { gql } = require('apollo-server-express');

const groupSchema = gql`
  
  type Group {
    uuid: String!
    org_id: String!
    name: String!
    owner: BasicUser!
    created: Date!
  }

  type GroupDetail {
    uuid: String!
    org_id: String!
    name: String!
    owner: BasicUser!
    created: Date!
    clusterCount: Int!
    subscriptionCount: Int!
    subscriptions: JSON!
    clusters: JSON!
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
    list all groups for org_id
    """
    groups(org_id: String!): [Group]

    """
    Gets a group detail for org_id and uuid
    """
    group(org_id: String! uuid: String!): GroupDetail

    """
    Gets a group detail for org_id and name
    """
    groupByName(org_id: String! name: String!): GroupDetail
  }

  extend type Mutation {
    """
    Adds a group
    """
    addGroup(org_id: String! name: String!): AddGroupReply!

    """
    Removes a group 
    """
    removeGroup(org_id: String! uuid: String!): RemoveGroupReply!

    """
    Removes a group by name 
    """
    removeGroupByName(org_id: String! name: String!): RemoveGroupReply!

    """
    group a list of clusters
    """
    groupClusters(org_id: String! uuid: String! clusters: [String]!): GroupClustersReply!

    """
    unGroup a list of clusters
    """
    unGroupClusters(org_id: String! uuid: String! clusters: [String]!): UnGroupClustersReply!

  }
`;

module.exports = groupSchema;
