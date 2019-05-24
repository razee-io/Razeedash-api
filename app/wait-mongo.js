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

const delay = require('delay');
const log = require('./log').log;


const MongoClientClass = require('./mongo/mongoClient.js');
const mongoConf = require('./conf.js').conf;
const MongoClient = new MongoClientClass(mongoConf);
MongoClient.log=log;



async function connect(){
  let result;
  let i=1;
  while(!result){
    try {
      log.info(`Attempt ${i} to connect to MongoDB`);
      result = await MongoClient.getClient();
    } catch (e) {
      i++;
      await delay(60000);
    }
  }
}

connect().then(() => {
  log.info('Connected. Exiting.');
  process.exit(0);

});
