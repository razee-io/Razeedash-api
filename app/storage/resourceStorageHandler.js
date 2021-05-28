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

/*
   Resource storage handler interface
*/

module.exports = class ResourceStorageHandler {

  constructor(targetHandler, metadata) {
    this.targetHandler = targetHandler;
    this.metadata = metadata;
  }

  async setDataAndEncrypt(stringOrBuffer, key) {
    return this.targetHandler.setDataAndEncrypt(stringOrBuffer, key);
  }

  async setData(stringOrBuffer) {
    return this.targetHandler.setData(stringOrBuffer);
  }

  async getDataAndDecrypt(key, iv) {
    return this.targetHandler.getDataAndDecrypt(key, iv);
  }
  async getData() {
    return this.targetHandler.getData();
  }

  async deleteData() {
    return this.targetHandler.deleteData();
  }

  serialize() {
    const data = this.targetHandler.serialize();
    return { metadata: this.metadata, data };
  }
};