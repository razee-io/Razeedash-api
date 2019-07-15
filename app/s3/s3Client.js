const clone = require('clone');
const AWS = require('aws-sdk');

module.exports = class S3Client {
  constructor(options) {
    let o = clone(options);
    this._conf = o.s3;
    this._aws = new AWS.S3(this._conf);
    this._locationConstraint = o.s3.locationConstraint;
  }

  async createBucket(bucketName) {
    this.log.debug(`Creating bucket ${bucketName}`);
    return this._aws.createBucket({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: this._locationConstraint
      },
    }).promise();
  }

  async createObject(bucketName, key, body) {
    this.log.debug(`Creating object ${bucketName} ${key}`);
    return this._aws.putObject({
      Bucket: bucketName,
      Key: key,
      Body: body
    }).promise();
  }

  async deleteObject(bucketName, key) {
    this.log.debug(`Deleting object ${bucketName} ${key}`);
    return this._aws.deleteObject({
      Bucket: bucketName,
      Key: key
    }).promise();
  }

  async deleteBucket(bucketName) {
    this.log.debug(`Deleting bucket ${bucketName}`);
    return this._aws.deleteBucket({
      Bucket: bucketName
    }).promise();
  }

  async bucketExists(bucketName) {
    try {
      const opts = {
        Bucket: bucketName
      };
      await this._aws.headBucket(opts).promise();
      return true;
    } catch (err) {
      if (err.statusCode >= 400 && err.statusCode < 500) {
        this.log.debug(`Bucket "${bucketName}" not found`);
        return false;
      }
      this.log.error(err, err.stack);
      throw new Error('S3 Error');
    }
  }

  async createBucketAndObject(bucket, key, data) {
    try {
      const exists = await this.bucketExists(bucket);
      if (!exists) {
        this.log.info(`bucket does not ${bucket} exist`);
        await this.createBucket(bucket);
      }
    } catch (err) {
      this.log.error(err);
    }
    return this.createObject(bucket, key, data);
  }

  get endpoint() {
    return this._conf.endpoint;
  }
  
  get log() {
    const nop = {
      error: () => {},
      info: () => {},
      debug: () => {}
    };
    const result = this._log || nop;
    return result;
  }

  set log(logger) {
    this._log = logger;
  }
};

