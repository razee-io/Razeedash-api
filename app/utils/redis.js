const Redis = require('ioredis');
const fs = require('fs');
// const RedisLock = require('ioredis-lock');

let client;
// let lockClient;

const createClient = ()=>{
  const url = process.env.REDIS_PUBSUB_URL || 'redis://127.0.0.1:6379/0';
  let tlsOption;
  if(process.env.REDIS_CERTIFICATE_PATH){
    tlsOption = { ca: [fs.readFileSync(process.env.REDIS_CERTIFICATE_PATH)] };
  }
  else{
    tlsOption = { rejectUnauthorized: false };
  }
  const options = {
    tls: tlsOption,
  };
  client = new Redis(url, options);
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


