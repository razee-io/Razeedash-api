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


/*
This sample shows how the RazeeDeployDelta job and parameters can be specified dynamically,
in this case simulating retrieving specific version strings from some remote system
rather than using 'latest'.

To use this sample, `export RDD_DYNAMIC_IMPL=./rdd-sample` before starting the server.
*/

async function getRddJobUrl(context) {
  const { req_id, logger } = context;
  logger.warn( {req_id}, 'using SAMPLE implementation, should only happen during dev/test' );
  // Instead of returning a string set as an env var, or 'latest', asynchronously find the 'best' version to use and return the url with it.
  const bestVersion = 'SPECIFIC_VERSION';
  return( `https://github.com/razee-io/razeedeploy-delta/releases/${bestVersion}/download/job.yaml` );
}

async function getRddArgs(context) {
  const { req_id, logger } = context;
  logger.warn( {req_id}, 'using SAMPLE implementation, should only happen during dev/test' );
  // Instead of returning an array parsed from an env var, or empty, generate the array of args asynchronously.
  const bestVersion = 'SPECIFIC_VERSION';
  const bucketName = 'my-bucket';
  return( [
    `--clustersubscription=${bestVersion}`,
    `--remoteresource=${bestVersion}`,
    `--encryptedresource=${bestVersion}`,
    `--watch-keeper=${bestVersion}`,
    `--file-source=https://s3.company.com/${bucketName}`,
    '--file-path={{=<% %>=}}{{install_version}}<%={{ }}=%>/us/resource.yaml'
  ] );
}

module.exports = { getRddJobUrl, getRddArgs };
