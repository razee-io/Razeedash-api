
const { models } = require('../apollo/models');

const _ = require('lodash');

const tagsStrToArr = (str)=>{
  let tags = [];
  if(_.isString(str)){
    tags = str.split(/,/);
  }
  else if(_.isArray(str)){
    tags = str;
  }
  else{
    throw `invalid input type "${typeof str}"`;
  }
  tags = _.map(tags, _.trim);
  tags = _.filter(tags);
  return tags;
};

const getSubscriptionUrls = async(orgId, tags, subsForOrg) => {
  // get tags.  query subscriptions that match all tags
  const matchingSubscriptions = _.filter(subsForOrg, (subscription)=>{
    var groupTags = tagsStrToArr(subscription.tags);
    return _.every(groupTags, (requiredTag)=>{
      return _.includes(tags, requiredTag);
    });
  });

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
    return {
      subscription_name: subscription.name, 
      subscription_channel: subscription.channel_name,
      subscription_version: subscription.version, 
      subscription_uuid: subscription.uuid, 
      url: url
    };
  });
  urls = urls.filter(Boolean);
  return urls;
};

module.exports = {
  tagsStrToArr,
  getSubscriptionUrls,
};
