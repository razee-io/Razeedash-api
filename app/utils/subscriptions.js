
const { models } = require('../apollo/models');

const _ = require('lodash');

const getSubscriptionUrls = async(orgId, matchingSubscriptions) => {

  const matchingChannels = await models.Channel.find({
    org_id: orgId,
    name: { $in: _.map(matchingSubscriptions, 'channelName') },
  });
  
  const matchingChannelsByName = _.keyBy(matchingChannels, 'name');

  let urls = _.map(matchingSubscriptions, (subscription)=>{
    const deployable = matchingChannelsByName[subscription.channelName];
    const foundVersion = deployable.versions.filter( (ver) => {
      return (ver.name === subscription.version);
    });
    
    let url;
    if(foundVersion.length > 0) {
      url = `api/v1/channels/${subscription.channelName}/${foundVersion[0].uuid}`;
    } 
    return {
      subscriptionName: subscription.name,
      subscriptionChannel: subscription.channelName,
      subscriptionVersion: subscription.version,
      subscriptionUuid: subscription.uuid,
      url: url
    };
  });
  urls = urls.filter(Boolean);
  return urls;
};

module.exports = {
  getSubscriptionUrls,
};
