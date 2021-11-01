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

const bunyan = require('bunyan');
const ebl = require('express-bunyan-logger');

const responseCodeMapper = (status, err, meta) => {
  if (meta && meta['req-headers'] && meta['req-headers']['authorization']) {
    meta['req-headers']['authorization'] = 'Bearer [HIDDEN]';
    meta['req-headers']['x-auth-refresh-token'] = 'Bearer [HIDDEN]';
  }
  if (meta && meta.method === 'OPTIONS' && status === 204) {
    // skip OPTION request 204 response
    return 'trace';
  } else if (meta && meta.body && meta.body.operationName === 'IntrospectionQuery') {
    // skip playground introspection query
    return 'trace';
  } else if (status === 500) {
    return 'error';
  } else if (status === 400 || status === 404) {
    return 'warn';
  } else if (status === 200 || status === 201) {
    return 'debug';
  } else {
    return 'info';
  }
};

/*
    Request context logger
*/
const getExpressBunyanConfig = (route) => {
  const result = {
    src: false, // turn on if needed for local debugging
    name: route,
    parseUA: false,
    excludes: ['referer', 'short-body'],
    levelFn: responseCodeMapper,
    obfuscate: ['req.headers.razee-org-key', 'req.headers.x-api-key', 'req.header.authorization', 'req.header.org-admin-key', 'req.body.variables.login', 'req.body.variables.password', 'req.body.variables.email', 'req.body.variables.name'],
    streams: [{
      level: process.env.LOG_LEVEL || 'info',
      stream: process.stdout
    }],
    serializers: {
      /*
      The body for resource updates from managed clusters can include details of the 'Impersonated-User' in object.status.children
      The body for resource updates from managed clusters can include errors in object.status.razee-logs.error such as:
        "[longsequenceofcharacters]": "Unable to fetch header secret data. { name: clustersubscription-[uuid]-secret, namespace: razeedeploy, key: razee-api-org-key }: secrets \"clustersubscription-[uuid]-secret\" is forbidden: User \"IAM#not-a-real-user@ibm.com\" cannot get resource \"secrets\" in API group \"\" in the namespace \"razeedeploy\""
      When the resource updates are published in Razeedash-api app/apollo/subscription/index.js's resourceChangedFunc function, Express logs the body, including the user name.
      To avoid logging the user name (PII of the user being impersonated), a custom 'body' serializer function is used to *truncate* unnecessary attributes and to *redact* any `IAM#` ids in errors.
      Specifically, any error string containing \"IAM#SOMETHING\" will have it replaced with \"[REDACTED]\".
      The truncation also helps minimize the size of the log entries created.
      */
      body: ( b => {
        try {
          const bodyArray = ( Array.isArray(b) ) ? b : [b];
          for( const bodyElem of bodyArray ) {
            if( bodyElem.object ) {
              for( const objectKey of Object.keys(bodyElem.object) ) {
                // Truncate object except specific desired properties
                if( ! ['kind','apiVersion','metadata','status'].includes(objectKey) ) {
                  bodyElem.object[objectKey] = '[TRUNCATED]';
                  continue;
                }
                // Truncate object.metadata except specific desired properties
                if( objectKey === 'metadata' ) {
                  for( const metadataKey of Object.keys(bodyElem.object[objectKey]) ) {
                    if( ! ['name','namespace','resourceVersion','selfLink','uid','creationTimestamp'].includes(metadataKey) ) {
                      bodyElem.object[objectKey][metadataKey] = '[TRUNCATED]';
                      continue;
                    }
                  }
                }
                // Truncate object.status except specific desired properties
                else if( objectKey === 'status' ) {
                  for( const statusKey of Object.keys(bodyElem.object[objectKey]) ) {
                    if( ! ['last-modified','razee-logs'].includes(statusKey) ) {
                      bodyElem.object[objectKey][statusKey] = '[TRUNCATED]';
                    }
                    // Redact object.status.razee-logs
                    if( statusKey === 'razee-logs' && bodyElem.object[objectKey][statusKey].error ) {
                      const error = bodyElem.object[objectKey][statusKey].error;
                      Object.keys(error).forEach( k => {
                        if( typeof error[k] === 'string' || error[k] instanceof String ) {
                          let usrStartIdx = error[k].indexOf( '"IAM#' );
                          while( usrStartIdx >= 0 ) {
                            const usrEndIdx = error[k].indexOf( '"', usrStartIdx + 1 );
                            if( usrEndIdx > usrStartIdx) {
                              error[k] = error[k].substring( 0, usrStartIdx + 1 ) + '[REDACTED]' + error[k].substring(usrEndIdx);
                              usrStartIdx = error[k].indexOf( '"IAM#' );
                            }
                            else {
                              // userEndIdx not found, can't redact any more
                              usrStartIdx = -1;
                            }
                          }
                        }
                      } );
                    }
                  }
                }
              }
            }
          }
        }
        catch(e) {
          // If any unexpected error is encountered while redacting, continue
          console.error( `Log redaction error: ${e.message}` );
        }
        return b;
      } )
    }
  };
  return result;
};

const getBunyanConfig = (route) => {
  const result = {
    src: false, // turn on if needed for local debugging
    name: route,
    streams: [{
      level: process.env.LOG_LEVEL || 'info',
      stream: process.stdout
    }]
  };
  return result;
};

const createExpressLogger = (route) => ebl(getExpressBunyanConfig(route));
const createLogger = (route, ids) => bunyan.createLogger({ ...getBunyanConfig(route), ...ids });

const log = bunyan.createLogger(getBunyanConfig('razeedash-api-test')); // logger for unit-tests

module.exports = { createLogger, createExpressLogger, log };
