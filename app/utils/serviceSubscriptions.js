const { models } = require('../apollo/models');

const _ = require('lodash');

const getServiceSubscriptionDetails = async(cluster) => {
  const serviceSubscriptions = await models.ServiceSubscription.find({ clusterId: cluster.cluster_id }).lean();
  let urls = _.map(serviceSubscriptions, (subscription)=>{
    let url = `api/v1/channels/${subscription.channelName}/${subscription.version_uuid}`;
    let kubeOwnerName = null;
    return {
      subscriptionName: subscription.name,
      subscriptionChannel: subscription.channelName,
      subscriptionVersion: subscription.version,
      subscriptionUuid: subscription.uuid,
      url: url,
      kubeOwnerName,
    };
  });
  return urls;
};

module.exports = {
  getServiceSubscriptionDetails
};
