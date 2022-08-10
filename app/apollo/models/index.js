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
const Cluster = require('./cluster');
const Organization = require('./organization');
const Channel = require('./channel');
const Subscription = require('./subscription');
const ServiceSubscription = require('./serviceSubscription');
const DeployableVersion = require('./deployableVersion');
const ResourceYamlHist = require('./resourceYamlHist');
const Group = require('./group');
const fs = require('fs');
const mongoConf = require('../../conf.js').conf;

mongoose.Promise = global.Promise; // use global es6 promises


const connectDb = async mongoUrl => {
  let mongooseOptions;
  const url =
    mongoUrl || process.env.MONGO_URL || 'mongodb://localhost:3001/meteor';

  // auto test uses
  if (process.env.NODE_ENV === 'production') {
    mongooseOptions = {
      autoIndex: false,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 10000,
      minPoolSize: 15,
    };
  } else {
    mongooseOptions = {
      autoIndex: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 10000,
      minPoolSize: 15,
    };
  }

  if(fs.existsSync(mongoConf.mongo.cert)) {
    mongooseOptions['tlsCAFile'] = mongoConf.mongo.cert;
  }

  //PLC
  mongoose.set('bufferCommands', false);

  await mongoose.connect(url, {
    ...mongooseOptions,
  });

  //PLC
  await User.createCollection();
  await Resource.createCollection();
  await Cluster.createCollection();
  await Organization.createCollection();
  await Channel.createCollection();
  await Subscription.createCollection();
  await ServiceSubscription.createCollection();
  await DeployableVersion.createCollection();
  await ResourceYamlHist.createCollection();
  await Group.createCollection();

  return mongoose;
};

const models = {
  Organization,
  User,
  Resource,
  Cluster,
  Channel,
  Group,
  Subscription,
  ServiceSubscription,
  DeployableVersion,
  ResourceYamlHist,
  dbConnections: []
};

module.exports = { models, connectDb };
