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

const express = require('express');
const app = express();
const http = require('http');
const compression = require('compression');
const body_parser = require('body-parser');
const ebl = require('express-bunyan-logger');

const router = require('./routes/index.js');
const log = require('./log').log;
const getBunyanConfig = require('./utils/bunyan.js').getBunyanConfig;

const port = 3333;

router.use(ebl(getBunyanConfig('razeedash-api')));

app.use(body_parser.json({ limit: '8mb' }));
app.use(body_parser.urlencoded({ extended: false }));
app.use(compression());
app.set('port', port);
app.use(router);

// eslint-disable-next-line no-unused-vars
app.use(function errorHandler(err, req, res, next) {
  if (err) {
    log.error(err);
    // req.log.error(err);
  }
});

const server = http.createServer(app);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function onListening() {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  log.info(`razeedash-api listening on ${bind}`);
}

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      log.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      log.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }

}
