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

const tokenCrypt = require('./../utils/crypt');
const _ = require('lodash');

class EmbeddedResourceHandler {
  constructor(data) {
    this.data = data;
  }

  async setDataAndEncrypt(stringOrBuffer, key) {
    if (!_.isString(stringOrBuffer)) {
      stringOrBuffer = stringOrBuffer.toString();
    }
    this.data = tokenCrypt.encrypt(stringOrBuffer, key);
  }

  async setData(stringOrBuffer) {
    if (!_.isString(stringOrBuffer)) {
      stringOrBuffer = stringOrBuffer.toString();
    }
    this.data = stringOrBuffer;
  }

  async getDataAndDecrypt(key) {  // iv is not used
    if (this.data === undefined) {
      throw new Error('Object data do not exist');
    }
    return tokenCrypt.decrypt(this.data, key);
  }

  async getData() {
    return this.data;
  }

  async deleteData() {
    this.data = undefined;
  }

  serialize() {
    return this.data;
  }
}

const constructor = () => {
  return new EmbeddedResourceHandler();
};

const deserializer = (data) => {
  return new EmbeddedResourceHandler(data);
};

module.exports = { constructor, deserializer };