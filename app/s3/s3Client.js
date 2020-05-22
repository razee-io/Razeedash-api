/**
 * Copyright 2019 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const clone = require('clone');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const _ = require('lodash');

const encryptionAlgorithm = 'aes-256-cbc';

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

  getObject(bucketName, key) {
    this.log.debug({ bucket: bucketName, key: key }, 'Getting object');
    return this._aws.getObject({
      Bucket: bucketName,
      Key: key
    });
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
      debug: () => {},
      warn: () => {},
    };
    const result = this._log || nop;
    return result;
  }

  set log(logger) {
    this._log = logger;
  }

  async ensureBucketExists(bucketName){
    try {
      const exists = await this.bucketExists(bucketName);
      if(!exists){
        this.log.warn('bucket does not exist', { bucketName });
        await this.createBucket(bucketName);
      }
    }catch(err){
      this.log.error('could not create bucket', { bucketName });
      throw err;
    }
  }

  // async uploadFile(bucketName, path, content){
  //   try {
  //     const exists = await this.bucketExists(bucketName);
  //     if(!exists){
  //       this.log.warn('bucket does not exist', { bucketName });
  //       await this.createBucket(bucketName);
  //     }
  //   }catch(err){
  //     this.log.error('could not create bucket', { bucketName });
  //     throw err;
  //   }
  //
  //   const result = await this._aws.upload({
  //     Bucket: bucketName,
  //     Key: path,
  //     Body: content,
  //   }).promise();
  //
  //   return `${this._conf.endpoint.match(/^http/i) ? 'https://' : ''}${this._conf.endpoint}/${bucketName}/${path}`;
  // }

  // const s3 = new AWS.S3(conf.s3);
  // const key = Buffer.concat([Buffer.from(req.orgKey)], 32);
  // const encrypt = crypto.createCipheriv(algorithm, key, iv);
  // const pipe = req.pipe(encrypt);
  // const params = {Bucket: bucket, Key: resourceName, Body: pipe};
  // const upload = s3.upload( params );
  // await upload.promise();

  async encryptAndUploadFile(bucketName, path, content, encryptionKey, iv=null){
    try {
      const exists = await this.bucketExists(bucketName);
      if(!exists){
        this.log.warn('bucket does not exist', { bucketName });
        await this.createBucket(bucketName);
      }
    }catch(err){
      this.log.error('could not create bucket', { bucketName });
      throw error;
    }

    const key = Buffer.concat([Buffer.from(encryptionKey)], 32);

    if(!iv){
      iv = crypto.randomBytes(16);
    }
    const ivText = iv.toString('base64');

    const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);

    // let encrypted = cipher.update(content);
    // encrypted = Buffer.concat([encrypted, cipher.final()]);

    const awsPromise = this._aws.upload({
      Bucket: bucketName,
      Key: path,
      Body: cipher,
    }).promise();

    cipher.write(content);
    cipher.end();

    await awsPromise;

    console.log('encrypted with', bucketName, path, content, key, iv, ivText);

    const url = `${this._conf.endpoint.match(/^http/i) ? '' : 'https://'}${this._conf.endpoint}/${bucketName}/${path}`;

    return {
      url, ivText,
    };
  }

  async getAndDecryptFile(bucketName, path, key, iv){
    console.log(1110, bucketName, path, key, iv);
    if(_.isString(iv)){
      iv = Buffer.from(iv, 'base64');
    }
    key = Buffer.concat([Buffer.from(key)], 32);

    var result = await this.getObject(bucketName, path).promise();
    var content = result.Body;
    console.log(3333, bucketName, path, content, key, iv);
    const decipher = crypto.createDecipheriv(encryptionAlgorithm, key, iv);
    let out = decipher.update(content);
    out = Buffer.concat([out, decipher.final()]);
    out = out.toString('utf8');
    console.log(4444, out);
    return out;


    // try {
    //   const s3stream = this.getObject(bucketName, path).createReadStream();
    //   const yaml = await readS3File(s3stream);
    //   return yaml;
    // }
    // catch (error) {
    //   this.log.error(error, 'Error retrieving data from s3 bucket');
    //   throw(error);
    // }
  }
};

setTimeout(async()=>{
  var s3Client = new module.exports(require('../conf.js').conf);
  var bucketName = 'razee--k4tty77xnpmgjppfw';
  var path = 'blah';
  var content = 'this is teh content';
  var encryptionKey = 'orgApiKey-21fd8bfa-cc1d-43dd-988f-ddec98d72db7';
  var ivText = 'oRAApY8YmWQx5a98rUVkhg==';
  var iv = Buffer.from(ivText, 'base64');

  console.log(11111, bucketName, path, content, encryptionKey, ivText, iv);

  await s3Client.encryptAndUploadFile(bucketName, path, content, encryptionKey, iv);

  console.log('uploaded');

  await s3Client.getAndDecryptFile(bucketName, path, encryptionKey, iv);

  console.log('downloaded');
},1);

// const readS3File = async (readable) => {
//   readable.setEncoding('utf8');
//   let data = '';
//   for await (const chunk of readable) {
//     data += chunk;
//   }
//   return data;
// };
