const Redis = require('ioredis');
// const RedisLock = require('ioredis-lock');

let client;
// let lockClient;

const createClient = ()=>{
  const url = process.env.REDIS_PUBSUB_URL || 'redis://127.0.0.1:6379/0';
  client = new Redis(url);
  return client;
};

const getRedisClient = async()=>{
  if(client){
    return client;
  }
  return await createClient();
};

// const getLockClient = async()=>{
//   if(lockClient){
//     return lockClient;
//   }
//   const client = getClient();
//   lockClient = RedisLock.createLock(client);
//   return lockClient;
// };

module.exports = {
  getRedisClient,
};


