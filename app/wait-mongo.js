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

const waitPort = require('wait-port');
const parseMongoUrl = require('parse-mongo-url');
const objectPath = require('object-path');
const log = require('./log').log;

const mongoUrl = parseMongoUrl(process.env.MONGO_URL);

const params = {
  host: objectPath.get(mongoUrl,'servers.0.host'),
  port: objectPath.get(mongoUrl,'servers.0.port')
};

waitPort(params)
  .then((open) => {
    if (open) log.info('The mongodb port is now open!');
    else log.info('The mongodb port did not open before the timeout...');
  })
  .catch((err) => {
    log.error(err, 'An unknown error occured while waiting for the mongodb port.');
  });
