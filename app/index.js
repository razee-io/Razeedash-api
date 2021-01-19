/**
 * Copyright 2019, 2021 IBM Corp. All Rights Reserved.
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
function run() {
  const express = require('express');
  const app = express();
  const http = require('http');
  const compression = require('compression');
  const body_parser = require('body-parser');
  const ebl = require('express-bunyan-logger');
  const addRequestId = require('express-request-id')();
  const { router, initialize } = require('./routes/index.js');
  const log = require('./log').log;
  const getBunyanConfig = require('./utils/bunyan.js').getBunyanConfig;
  const port = 3333;

  const swaggerUi = require('swagger-ui-express');
  const swaggerDocument = require('./swagger.json');
  const apollo = require('./apollo');

  const promClient = require('prom-client');
  const collectDefaultMetrics = promClient.collectDefaultMetrics;
  collectDefaultMetrics({ timeout: 5000 });    //Collect all default metrics
  const connections = new promClient.Gauge({ name: 'razee_server_connections_count', help: 'Razee server request count' });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  router.use(ebl(getBunyanConfig('razeedash-api')));

  app.set('trust proxy', true);
  app.use(addRequestId);
  app.use(compression());

  app.use(body_parser.json({ limit: '8mb' }));
  app.use(body_parser.urlencoded({ extended: false }));
  app.set('port', port);
  app.use('/api', router); // only for everything under /api

  app.use(function errorHandler(err, req, res, next) {
    if (err) {
      if (req.log && req.log.error)
        req.log.error(err);
      else
        log.error(err);
      if (!res.headersSent) {
        let statusCode = err.statusCode || 500;
        return res.status(statusCode).send();
      } else {
        return next(err);
      }
    }
    next();
  });

  app.get('/metrics', function (request, response) {
    response.writeHead(200, { 'Content-Type': promClient.register.contentType });
    response.end(promClient.register.metrics());
  });

  const server = http.createServer(app);

  server.on('ready', async () => {
    await apollo({ app, httpServer: server });
    server.listen(port);
  });

  server.on('error', (error) => {
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
  });

  server.on('listening', () => {
    const addr = server.address();
    const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
    log.info(`🏄 razeedash-api listening on ${bind}/api`);
  });

  server.on('connection', () => {
    server.getConnections(function (error, count) {
      //console.log('Number of concurrent connections to the server : ' + count);
      connections.set(count);
    });
  });

  initialize().then((db) => {
    app.set('db', db);
    server.emit('ready');
  });
}

module.exports = {
  run
};
