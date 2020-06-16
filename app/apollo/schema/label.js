const { gql } = require('apollo-server-express');

const labelSchema = gql`
  
  type Label {
    uuid: String!
    orgId: String!
    name: String!
    owner: BasicUser!
    created: Date!
  }

  type LabelDetail {
    uuid: String!
    orgId: String!
    name: String!
    owner: BasicUser!
    created: Date!
    clusterCount: Int!
    subscriptionCount: Int!
  }

  type AddLabelReply {
    uuid: String!
  }

  type RemoveLabelReply {
    uuid: String!
    success: Boolean
  }

  type LabelClustersReply {
    modified: Int!
  }

  type UnlabelClustersReply {
    modified: Int!
  }

  extend type Query {
    """
    list all labels for orgId
    """
    labels(orgId: String!): [Label]

    """
    Gets a label detail for orgId and uuid
    """
    label(orgId: String! uuid: String!): LabelDetail

    """
    Gets a label detail for orgId and name
    """
    labelByName(orgId: String! name: String!): LabelDetail
  }

  extend type Mutation {
    """
    Adds a label
    """
    addLabel(orgId: String! name: String!): AddLabelReply!

    """
    Removes a label 
    """
    removeLabel(orgId: String! uuid: String!): RemoveLabelReply!

    """
    Removes a label by name 
    """
    removeLabelByName(orgId: String! name: String!): RemoveLabelReply!

    """
    label a list of clusters
    """
    labelClusters(orgId: String! uuid: String! clusters: [String]!): LabelClustersReply!

    """
    unlabel a list of clusters
    """
    unlabelClusters(orgId: String! uuid: String! clusters: [String]!): UnlabelClustersReply!

  }
`;

module.exports = labelSchema;