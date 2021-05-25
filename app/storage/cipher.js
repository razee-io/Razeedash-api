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

'use strict';

const crypto = require('crypto');
const _ = require('lodash');

const encryptionAlgorithm = 'aes-256-cbc';

const encrypt = (stringOrBuffer, encryptionKey) => {
  const iv = crypto.randomBytes(16);
  const ivText = iv.toString('base64');
  const key = Buffer.concat([Buffer.from(encryptionKey)], 32);
  const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);
  if (_.isString(stringOrBuffer)) {
    stringOrBuffer = Buffer.from(stringOrBuffer);
  }
  const encryptedBuffer = Buffer.concat([cipher.update(stringOrBuffer), cipher.final()]);
  return { encryptedBuffer, ivText };
};

const decryptBuffer = (encryptedBuffer, encryptionKey, iv) => {
  if (_.isString(iv)) {
    iv = Buffer.from(iv, 'base64');
  }

  const key = Buffer.concat([Buffer.from(encryptionKey)], 32);
  const decipher = crypto.createDecipheriv(encryptionAlgorithm, key, iv);
  const decrpytedBuffer = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);

  return decrpytedBuffer.toString('utf8');
};

/*
const encryptStream = (unencryptedStream, encryptionKey) => {
    const iv = crypto.randomBytes(16);
    const ivText = iv.toString('base64');
    const key = Buffer.concat([Buffer.from(encryptionKey)], 32);
    const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);
    return { encryptedStream: unencryptedStream.pipe(cipher), ivText };
}

const decryptStream = (encryptedStream, encryptionKey, iv) => {
    if (_.isString(iv)) {
        iv = Buffer.from(iv, 'base64');
    }
    const key = Buffer.concat([Buffer.from(encryptionKey)], 32);
    const decipher = crypto.createDecipheriv(encryptionAlgorithm, key, iv);
    return { decryptedStream: encryptedStream.pipe(decipher) };
}
*/

module.exports = { encrypt, decryptBuffer };  // encryptStream, decryptStream