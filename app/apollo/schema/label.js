const { gql } = require('apollo-server-express');

const labelSchema = gql`
  
  type Label {
    uuid: String!
    org_id: String!
    name: String!
    owner: BasicUser!
    created: Date!
  }

  type LabelDetail {
    uuid: String!
    org_id: String!
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
    list all labels for org_id
    """
    labels(org_id: String!): [Label]

    """
    Gets a label detail for org_id and uuid
    """
    label(org_id: String! uuid: String!): LabelDetail

    """
    Gets a label detail for org_id and name
    """
    labelByName(org_id: String! name: String!): LabelDetail
  }

  extend type Mutation {
    """
    Adds a label
    """
    addLabel(org_id: String! name: String!): AddLabelReply!

    """
    Removes a label 
    """
    removeLabel(org_id: String! uuid: String!): RemoveLabelReply!

    """
    Removes a label by name 
    """
    removeLabelByName(org_id: String! name: String!): RemoveLabelReply!

    """
    label a list of clusters
    """
    labelClusters(org_id: String! uuid: String! clusters: [String]!): LabelClustersReply!

    """
    unlabel a list of clusters
    """
    unlabelClusters(org_id: String! uuid: String! clusters: [String]!): UnlabelClustersReply!

  }
`;

module.exports = labelSchema;
