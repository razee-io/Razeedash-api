
const mongoConf = require('../conf.js').conf;
const MongoClientClass = require('../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);

const _ = require('lodash');

export const tagsStrToArr = (str)=>{
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

export const getSubscriptionUrls = async(orgId, tags, subsForOrg) => {
  // get tags.  query subscriptions that match all tags
  const matchingSubscriptions = _.filter(subsForOrg, (subscription)=>{
    var groupTags = tagsStrToArr(subscription.tags);
    return _.every(groupTags, (requiredTag)=>{
      return _.includes(tags, requiredTag);
    });
  });

  const db = await MongoClient.getClient();
  const Channels = db.collection('channels');
  const matchingChannels = await Channels.find({
    org_id: orgId,
    name: { $in: _.map(matchingSubscriptions, 'channel') },
  }).toArray();
  
  const matchingChannelsByName = _.keyBy(matchingChannels, 'name');

  let urls = _.map(matchingSubscriptions, (subscription)=>{
    const deployable = matchingChannelsByName[subscription.channel];
    const foundVersion = deployable.versions.filter( (ver) => {
      return (ver.name === subscription.version);
    });
    
    let url;
    if(foundVersion.length > 0) {
      url = `api/v1/channels/${subscription.channel}/${foundVersion[0].uuid}`;
    } 
    return url;
  });
  urls = urls.filter(Boolean);
  return urls;
};
