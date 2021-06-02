const bunyan = require('bunyan');
const { getBunyanConfig } = require('../../utils/bunyan');
const logger = bunyan.createLogger(getBunyanConfig('razeedash-api/cron/migrateResourcesToNewOrgKeysCron'));
const conf = require('../../conf.js').conf;

const { migrateResourcesToNewOrgKeysCron } = require('../../utils/orgs');

var getDb = async()=>{
  const MongoClientClass = require('../../mongo/mongoClient.js');

  const MongoClient = new MongoClientClass(conf);
  return await MongoClient.getClient({});
};

var getS3 = async()=>{
  const S3ClientClass = require('../../s3/s3Client');
  return new S3ClientClass(conf);
};

var run = async()=>{
  var db = await getDb();
  var s3 = await getS3();
  try {
    logger.info('starting migrateResourcesToNewOrgKeysCron');
    await migrateResourcesToNewOrgKeysCron({ db, s3, logger });
    logger.info('done with migrateResourcesToNewOrgKeysCron');
  }
  catch(err){
    logger.error(err, 'razeedash-api migrateResourcesToNewOrgKeysCron threw an error');
    process.exit(1);
  }
  process.exit(0);
};

run();
