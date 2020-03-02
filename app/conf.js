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

const conf = {
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://localhost:3001/meteor',
    dbName: process.env.MONGO_DB_NAME || 'meteor',
    cert: process.env.MONGO_CERT
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    locationConstraint: process.env.S3_LOCATION_CONSTRAINT || 'us-standard',
    bucketPrefix: process.env.S3_BUCKET_PREFIX || 'razee'
  }
};

module.exports = {
  conf
};
