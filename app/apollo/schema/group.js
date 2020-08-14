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
  type EditClusterGroupsReply{
    modified: Int!
  }

  extend type Query {
    """
    list all groups for orgId
    """
    groups(orgId: String! @sv): [GroupDetail]

    """
    Gets a group detail for orgId and uuid
    """
    group(orgId: String! @sv uuid: String! @sv): GroupDetail

    """
    Gets a group detail for orgId and name
    """
    groupByName(orgId: String! @sv, name: String! @sv): GroupDetail
  }

  extend type Mutation {
    """
    Adds a group
    """
    addGroup(orgId: String! @sv name: String! @sv): AddGroupReply!

    """
    Removes a group 
    """
    removeGroup(orgId: String! @sv uuid: String! @sv): RemoveGroupReply!

    """
    Removes a group by name 
    """
    removeGroupByName(orgId: String! @sv name: String! @sv): RemoveGroupReply!

    """
    group a list of clusters
    """
    groupClusters(orgId: String! @sv uuid: String! @sv clusters: [String]! @sv): GroupClustersReply!

    """
    unGroup a list of clusters
    """
    unGroupClusters(orgId: String! @sv uuid: String! @sv clusters: [String]! @sv): UnGroupClustersReply!

    """
    Adds a list of groups to a list of clusterIds
    """
    assignClusterGroups(orgId: String! @sv, groupUuids: [String!]! @sv, clusterIds: [String!]! @sv): AssignClusterGroupsReply!

    """
    Removes a list of groups from a list of clusterIds
    """
    unassignClusterGroups(orgId: String! @sv, groupUuids: [String!]! @sv, clusterIds: [String!]! @sv): UnassignClusterGroupsReply!
    
    """
    Overwrites a cluster's groups to exactly whats specified
    """
    editClusterGroups(orgId: String! @sv, clusterId: String! @sv, groupUuids: [String!]! @sv): EditClusterGroupsReply!
  }
`;

module.exports = groupSchema;
