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
    subscriptions: [ChannelSubscription!]!
    clusters: [Cluster!]!
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

  type AssignClusterGroupsReply{
    modified: Int!
  }

  type UnassignClusterGroupsReply{
    modified: Int!
  }

  extend type Query {

    """
    list all groups for orgId
    """
    groups(orgId: String!): [GroupDetail]

    """
    Gets a group detail for orgId and uuid
    """
    group(orgId: String! uuid: String!): GroupDetail

    """
    Gets a group detail for orgId and name
    """
    groupByName(orgId: String!, name: String! ): GroupDetail
  }

  extend type Mutation {
    """
    Adds a group
    """
    addGroup(orgId: String! name: String! @identifier(min: 3, max: 32)): AddGroupReply!

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

    """
    Adds a list of groups to a list of clusterIds
    """
    assignClusterGroups(orgId: String!, groupUuids: [String!]!, clusterIds: [String!]!): AssignClusterGroupsReply!

    """
    Removes a list of groups from a list of clusterIds
    """
    unassignClusterGroups(orgId: String!, groupUuids: [String!]!, clusterIds: [String!]!): UnassignClusterGroupsReply!
  }
`;

module.exports = groupSchema;
