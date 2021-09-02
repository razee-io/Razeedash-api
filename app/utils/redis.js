var Redis = require('ioredis');
var RedisLock = require('ioredis-lock');

var client;
var lockClient;

var createClient = ()=>{
  var url = process.env.REDIS_PUBSUB_URL || 'redis://127.0.0.1:6379/0';
  client = new Redis(url);
  return client;
};

var getRedisClient = async()=>{
  if(client){
    return client;
  }
  return await createClient();
};

var getLockClient = async()=>{
  if(lockClient){
    return lockClient;
  }
  var client = getClient();
  lockClient = RedisLock.createLock(client);
  return lockClient;
};

module.exports = {
  getRedisClient,
};


