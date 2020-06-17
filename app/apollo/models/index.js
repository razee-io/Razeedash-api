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

const bunyan = require('bunyan');
const mongoose = require('mongoose');
const User = require('./user');
const Resource = require('./resource');
const ResourceSchema = require('./resource.schema');
const Cluster = require('./cluster');
const ClusterSchema = require('./cluster.schema');
const Organization = require('./organization');
const Channel = require('./channel');
const Subscription = require('./subscription');
const DeployableVersion = require('./deployableVersion');
const ResourceYamlHist = require('./resourceYamlHist');
const Label = require('./label');
const { getBunyanConfig } = require('../../utils/bunyan');

mongoose.Promise = global.Promise; // use global es6 promises

const logger = bunyan.createLogger(getBunyanConfig('apollo/models'));

const connectDb = mongoUrl => {
  let mongooseOptions;
  const url =
    mongoUrl || process.env.MONGO_URL || 'mongodb://localhost:3001/meteor';

  // auto test uses
  if (process.env.NODE_ENV === 'production') {
    mongooseOptions = {
      autoIndex: false,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 5000,
      poolSize: 5,
      useNewUrlParser: true,
      useFindAndModify: true,
      useCreateIndex: true,
      useUnifiedTopology: true,
    };
  } else {
    mongooseOptions = {
      autoIndex: true,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 5000,
      poolSize: 5,
      useNewUrlParser: true,
      useFindAndModify: true,
      useCreateIndex: true,
      useUnifiedTopology: true,
    };
  }

  return mongoose.connect(url, {
    ...mongooseOptions,
  });
};

const models = {
  Organization,
  User,
  Resource,
  Cluster,
  Channel,
  Label,
  Subscription,
  DeployableVersion,
  ResourceYamlHist,
  dbConnections: [],
  ClusterDistributed: [],
  ResourceDistributed: [],
  OrganizationDistributed: [],
};

function obscureUrl(url) {
  return url.replace(/:\/\/.*@/gi, '://xxxxxxx'.concat(':yyyyyyyy', '@'));
}

async function closeDistributedConnections() {
  if ( models.dbConnections && models.dbConnections.length > 0) {
    models.dbConnections.map(conn => {
      conn.conn.close();
    });
  }
  models.dbConnections = [];
}

async function setupDistributedCollections(mongoUrlsString) {
  const urls = mongoUrlsString.split(';');
  const dbConnections = await Promise.all(
    urls.map(async url => {
      const conn = await mongoose.createConnection(url, {
        autoIndex: false,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 5000,
        poolSize: 5,
        useNewUrlParser: true,
        useFindAndModify: true,
        useCreateIndex: true,
        useUnifiedTopology: true,
      });
      return { url, conn };
    }),
  );

  await closeDistributedConnections();

  models.dbConnections = dbConnections;
  
  models.ResourceDistributed = dbConnections.map(conn => {
    const mod = conn.conn.model('resources', ResourceSchema);
    logger.info(
      `SetupDistributedCollections received modelName=${
        mod.modelName
      } for DB ${obscureUrl(conn.url)}`,
    );
    return mod;
  });

  const organizationSchema = models.Organization.schema;
  models.OrganizationDistributed = dbConnections.map(conn => {
    const mod = conn.conn.model('orgs', organizationSchema);
    logger.info(
      `SetupDistributedCollections received modelName=${
        mod.modelName
      } for DB ${obscureUrl(conn.url)}`,
    );
    return mod;
  });

  models.ClusterDistributed = dbConnections.map(conn => {
    const mod = conn.conn.model('clusters', ClusterSchema);
    logger.info(
      `SetupDistributedCollections:clusters - received modelName=${mod.modelName} for DB ${obscureUrl(conn.url)}`,
    );
    return mod;
  });
}

module.exports = { models, connectDb, setupDistributedCollections, closeDistributedConnections };
