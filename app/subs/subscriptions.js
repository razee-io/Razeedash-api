var _ = require('lodash');
var objectHash = require('object-hash');

const log = require('../log').log;

const mongoConf = require('../conf.js').conf;
const MongoClientClass = require('../mongo/mongoClient.js');
const MongoClient = new MongoClientClass(mongoConf);

const tagsStrToArr = require('../utils/subscriptions.js').tagsStrToArr;
const getSubscriptionUrls = require('../utils/subscriptions.js').getSubscriptionUrls;

var { sub } = require('../utils/pubsub.js');

/*
* Waits for socketio connections
* On connect (with valid auth), sends an event containing the Subscription urls which match the `tags` specified on connect
* Also builds a redis pubsub that listens on the following events: ['updateSubscription', 'addSubscription', 'removeSubscription']
* On event, rechecked which urls should be displayed. if theres changes from what was last sent to the client, sends a new event with the urls
*/

module.exports = async(orgKey, socket)=>{
  const tagsString = socket.handshake.query['tags'];
  if (!tagsString) {
    log.error(`no tags were supplied.  ${socket.id} disconnected`);
    socket.disconnect(true);
    return false;
  }
  const tags = tagsStrToArr(tagsString);
  const db = await MongoClient.getClient();
  const Orgs = db.collection('orgs');
  const org = await Orgs.findOne({ orgKeys: orgKey });
  if (!org) {
    log.error(`bad org key.  ${socket.id} disconnected`);
    socket.disconnect(true);
    return false;
  }

  // get tags.  query subscriptions that match all tags
  // emit the resource urls back to the client (using ryan's code in the subscriptions/deployabes route)
  const orgId = org._id;

  var prevSubs = [];

  const Subscriptions = db.collection('subscriptions');

  var onMsg = async(data)=>{
    // filter
    if(data.orgId != orgId){
      return false;
    }

    // otherwise maybe we need to update
    var curSubs = await Subscriptions.aggregate([
      { $match: { 'org_id': orgId } },
      { $project: { tags: 1, version: 1, channel: 1, isSubSet: { $setIsSubset: ['$tags', tags ] } } },
      { $match: { 'isSubSet': true } }
    ]).toArray();
    curSubs = _.sortBy(curSubs, '_id');

    var prevSubIds = _.map(prevSubs, '_id');
    var curSubIds = _.map(curSubs, '_id');

    var addedSubIds = _.without(curSubIds, ...prevSubIds);
    var removedSubIds = _.without(prevSubIds, ...curSubIds);
    var objsHaveUpdates = objectHash(curSubs) != objectHash(prevSubs);

    //console.log(`updates: ${objsHaveUpdates}, added: ${addedSubIds.length}, removed: ${removedSubIds.length}`);

    if(!objsHaveUpdates && addedSubIds.length < 1 && removedSubIds.length < 1){
      // no changes, so doesnt do anything
      return false;
    }

    var urls = await getSubscriptionUrls(orgId, tags, curSubs);

    log.info(`sending urls to ${socket.id}`, { urls });

    socket.emit('subscriptions', urls);

    prevSubs = curSubs;

    return true;
  };
  var handles = [
    sub('updateSubscription', onMsg),
    sub('addSubscription', onMsg),
    sub('removeSubscription', onMsg),
  ];

  socket.on('disconnect', ()=>{
    log.info(`disconnecting subscription ${socket.id}`);
    _.each(handles, (handle)=>{
      handle.unsubscribe();
    });
  });

  // trigger once so they get the original
  onMsg({
    orgId,
  });

  return true;
};
