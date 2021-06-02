
const { models } = require('../apollo/models');

const _ = require('lodash');

const getSubscriptionUrls = async(orgId, matchingSubscriptions, cluster) => {

  const matchingChannels = await models.Channel.find({
    org_id: orgId,
    name: { $in: _.map(matchingSubscriptions, 'channelName') },
  });

  const matchingChannelsByName = _.keyBy(matchingChannels, 'name');

  const kubeOwnerIds = _.uniq(_.map(matchingSubscriptions, 'kubeOwnerId'));
  let kubeOwnerIdsToNames = {};
  if(cluster.registration.location){
    kubeOwnerIdsToNames = await models.User.convertKubeOwnerIdsToNames(kubeOwnerIds);
  }

  let urls = _.map(matchingSubscriptions, (subscription)=>{
    const deployable = matchingChannelsByName[subscription.channelName];
    const foundVersion = deployable.versions.filter( (ver) => {
      return (ver.name === subscription.version);
    });

    let url;
    if(foundVersion.length > 0) {
      url = `api/v1/channels/${subscription.channelName}/${foundVersion[0].uuid}`;
    }
    let kubeOwnerName = null;
    if(cluster.registration.location){
      kubeOwnerName = kubeOwnerIdsToNames[subscription.kubeOwnerId] || null;
    }
    return {
      subscriptionName: subscription.name,
      subscriptionChannel: subscription.channelName,
      subscriptionVersion: subscription.version,
      subscriptionUuid: subscription.uuid,
      url: url,
      kubeOwnerName,
    };
  });
  urls = urls.filter(Boolean);
  return urls;
};

module.exports = {
  getSubscriptionUrls,
};
