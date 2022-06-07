/**
* Copyright 2019, 2022 IBM Corp. All Rights Reserved.
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
const MongoDBClient = require('mongodb').MongoClient;
const pLimit = require('p-limit');
const objectPath = require('object-path');
const fs = require('fs');

module.exports = class MongoClient {
  constructor(options) {
    let o = clone(options);
    this._mongo = o.mongo;
    this._collectionIndices = {};
    this._client;
  }
  get dbName() {
    return this._mongo.dbName;
  }
  get url() {
    return this._mongo.url;
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

  set log(logger){
    this._log=logger;
  }

  async _createCollectionIndexes(collection, collectionName, indices) {
    let indexAdded = false;
    const limit = pLimit(5);
    await Promise.all(indices.map(async index => {
      return limit(async () => {
        let iname = objectPath.get(index.options.name);
        if(!this._collectionIndices[collectionName].some((e)=>e.name === iname)){
          try {
            await collection.createIndex(index.keys, index.options);
          } catch (e) {
            this.log.error(e,`Failed to create index ${iname} on collection ${collectionName}`);
          }
          indexAdded = true;
        }
      });
    }));
    return indexAdded;
  }

  async _createIndexes(collectionIndices){
    const collectionsToIndex = Object.keys(collectionIndices);
    const limit = pLimit(5);
    await Promise.all(collectionsToIndex.map(async collectionName => {
      return limit(async () => {
        let indexAdded = false;
        let collection = await this._getCollection(collectionName);
        if(!this._collectionIndices[collectionName]){
          this._collectionIndices[collectionName] = await collection.indexes();
        }
        try {
          indexAdded = await this._createCollectionIndexes(collection, collectionName, collectionIndices[collectionName]);
        } catch (e){
          this.log.error(e);
        }
        if(indexAdded){
          this._collectionIndices[collectionName] = await collection.indexes();
          this.log.info(`Created new collection ${collectionName} index ${collectionName}`);
        }
      });
    }));
  }

  async _createViews(viewsToCreate){
    let result=[];
    if(!Array.isArray(viewsToCreate)) {
      return(result);
    }
    const db = await this._clientConnect();
    for(let i=0; i<viewsToCreate.length;i++){
      let view = viewsToCreate[i];
      try {
        // catch the exception for views
        let v=await db.createCollection(view.name, {viewOn: view.source, pipeline: view.pipeline, collation: view.options });
        this.log.info(`Created new View ${view.name}`);
        result.push(v);
      } catch (e) {
        if( e.message && e.message === 'Namespace already exists' ) {
          this.log.info(`View ${view.name} already exists`);
        }
        else {
          this.log.warn(e,`Error creating View ${view.name}`);
        }
      }
    }
    return result;
  }

  async _getCollection(collectionName){
    let collection;
    try {
      const db = await this._clientConnect();
      const collectionsArray = await db.listCollections({name:collectionName},{nameOnly:true}).toArray();
      if(collectionsArray.length === 0){
        this.log.debug(`Creating collection ${collectionName}.`);
        collection = await db.createCollection(collectionName);
      } else {
        collection = await db.collection(collectionName);
      }
    } catch (e){
      this.log.error(e,`Error getting collection ${collectionName}.`);
    }
    return collection;
  }

  async _clientConnect(){
    if (!this._client) {
      const options = {useNewUrlParser: true, useUnifiedTopology: true};
      if(fs.existsSync(this._mongo.cert)) {
        options['tlsCAFile'] = this._mongo.cert;
        this.log.info(`Using tlsCAFile: ${this._mongo.cert}`);
      }
      let client = await MongoDBClient.connect(this.url, options);
      this._client = client.db(this.dbName);
    }
    return this._client;
  }

  async getClient(options) {
    await this._clientConnect();
    if(options && typeof options['collection-indexes'] === 'object') {
      await this._createIndexes(options['collection-indexes']);
      await this._createViews(options['views']);
    }
    return this._client;
  }

};
