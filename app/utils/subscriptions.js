
const { models } = require('../apollo/models');

const _ = require('lodash');

const getSubscriptionUrls = async(orgId, matchingSubscriptions, deprecated) => {

  const matchingChannels = await models.Channel.find({
    org_id: orgId,
    name: { $in: _.map(matchingSubscriptions, 'channel_name') },
  });
  
  const matchingChannelsByName = _.keyBy(matchingChannels, 'name');

  let urls = _.map(matchingSubscriptions, (subscription)=>{
    const deployable = matchingChannelsByName[subscription.channel_name];
    const foundVersion = deployable.versions.filter( (ver) => {
      return (ver.name === subscription.version);
    });
    
    let url;
    if(foundVersion.length > 0) {
      url = `api/v1/channels/${subscription.channel_name}/${foundVersion[0].uuid}`;
    } 
    if (deprecated) {
      return {
        subscription_name: subscription.name,
        subscription_channel: subscription.channel,
        subscription_version: subscription.version,
        subscription_uuid: subscription.uuid,
        url: url
      };
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
