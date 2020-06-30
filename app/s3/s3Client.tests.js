/* eslint-env node, mocha */
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
const assert = require('assert');
const rewire = require('rewire');
const AwsS3Mock = require('mock-aws-s3');
var stream = require('stream');

const S3Client = rewire('./s3Client');

AwsS3Mock.config.basePath = '/tmp/buckets';
S3Client.__set__({
  AWS: AwsS3Mock,
  bucketExists: ()=>{return true;}, //mock library doesnt have this function
});

describe('s3', () => {
  describe('s3Client', () => {
    it('encrypt, upload, download, and decrypt', async () => {
      //assert.equal(responseCodeMapper(500), 'error');
      var s3Client = new S3Client({
        s3: {
          endpoint: 'http://someS3/',
          accessKeyId: 'accessKey',
          secretAccessKey: 'secretKey',
          locationConstraint: 'us-standard',
          channelBucket: 'razee',
          s3ForcePathStyle: true,
          signatureVersion: 'v4',
          sslEnabled: false,
        },
      });

      var bucketName = 'razee--k4tty77xnpmgjppfw';
      var path = 'blah';
      var inContent = 'this is teh content';
      var fileStream = stream.Readable.from([ inContent ]);
      var encryptionKey = 'orgApiKey-21fd8bfa-cc1d-43dd-988f-ddec98d72db7';
      var ivText = 'oRAApY8YmWQx5a98rUVkhg==';
      var iv = Buffer.from(ivText, 'base64');

      await s3Client.createBucket(bucketName);
      s3Client.bucketExists = ()=>{return true;};

      // encrypts and uploads
      await s3Client.encryptAndUploadFile(bucketName, path, fileStream, encryptionKey, iv);

      // downloads and decrypts
      var outContent = await s3Client.getAndDecryptFile(bucketName, path, encryptionKey, iv);

      // makes sure we got the right content back
      assert.equal(inContent, outContent);
    });
  });
});
