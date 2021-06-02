const bunyan = require('bunyan');
const { getBunyanConfig } = require('../../utils/bunyan');
const logger = bunyan.createLogger(getBunyanConfig('razeedash-api/cron/rotateEncKeys'));
const conf = require('../../conf.js').conf;

const { cronRotateEncKeys } = require('../../utils/orgs');

var getDb = async()=>{
  const MongoClientClass = require('../../mongo/mongoClient.js');
  const MongoClient = new MongoClientClass(conf);
  return await MongoClient.getClient({});
};

var run = async()=>{
  var db = await getDb();
  try {
    logger.info('starting cronRotateEncKeys');
    await cronRotateEncKeys({ db, logger });
    logger.info('done with cronRotateEncKeys');
  }
  catch(err){
    logger.error(err, 'razeedash-api cronRotateEncKeys threw an error');
    process.exit(1);
  }
  process.exit(0);
};

run();
