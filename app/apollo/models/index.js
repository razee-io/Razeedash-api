/**
 * Copyright 2020 IBM Corp. All Rights Reserved.
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

const mongoose = require('mongoose');
const User = require('./user');
const Resource = require('./resource');
const ResourceStat = require('./resourceStat');
const Cluster = require('./cluster');
const Organization = require('./organization');
const Channel = require('./channel');
const Message = require('./message');
const Subscription = require('./subscription');
const ServiceSubscription = require('./serviceSubscription');
const DeployableVersion = require('./deployableVersion');
const ResourceYamlHist = require('./resourceYamlHist');
const Group = require('./group');
const fs = require('fs');
const mongoConf = require('../../conf.js').conf;

mongoose.Promise = global.Promise; // use global es6 promises


const connectDb = mongoUrl => {
  let mongooseOptions;
  const url =
    mongoUrl || process.env.MONGO_URL || 'mongodb://localhost:3001/meteor';

  // auto test uses
  if (process.env.NODE_ENV === 'production') {
    mongooseOptions = {
      autoIndex: false,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 10000,
      poolSize: 15,
      useNewUrlParser: true,
      useFindAndModify: true,
      useCreateIndex: true,
      useUnifiedTopology: true,
    };
  } else {
    mongooseOptions = {
      autoIndex: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 10000,
      poolSize: 15,
      useNewUrlParser: true,
      useFindAndModify: true,
      useCreateIndex: true,
      useUnifiedTopology: true,
    };
  }

  if(fs.existsSync(mongoConf.mongo.cert)) {
    mongooseOptions['tlsCAFile'] = mongoConf.mongo.cert;
  }

  return mongoose.connect(url, {
    ...mongooseOptions,
  });
};

const models = {
  Organization,
  User,
  Resource,
  ResourceStat,
  Cluster,
  Message,
  Channel,
  Group,
  Subscription,
  ServiceSubscription,
  DeployableVersion,
  ResourceYamlHist,
  dbConnections: []
};

module.exports = { models, connectDb };
