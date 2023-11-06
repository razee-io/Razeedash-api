/**
 * Copyright 2023 IBM Corp. All Rights Reserved.
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

const { Counter, Histogram } = require('prom-client');
// Maintain a map for previously created counters and histograms
const counters = {};
const histograms = {};

const apiCallsCount = new Counter({
  name: 'api_calls_total',
  help: 'Total number of API calls'
});

const customMetricsClient = {
  apiCallsCount: apiCallsCount,

  // Count success and failure of each API operation and record as unique metric
  apiCallCounter(operationName) {
    if (!counters[operationName]) {
      counters[operationName] = new Counter({
        name: `${operationName}_counter_result_total`,
        help: `Total number of ${operationName} operation calls, labeled by success or failure`,
        labelNames: ['status']
      });
    }
    return counters[operationName];
  },

  // Track duration of each API operation and record as unique metric
  apiCallHistogram(operationName) {
    if (!histograms[operationName]) {
      histograms[operationName] = new Histogram({
        name: `${operationName}_duration_seconds`,
        help: `Duration of ${operationName} operations in seconds`,
        buckets: [0.1, 0.5, 1, 2, 5]
      });
    }
    return histograms[operationName];
  }
};

module.exports = {
  customMetricsClient
};
