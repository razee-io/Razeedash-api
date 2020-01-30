const log = require('../log').log;
const SocketIo = require('socket.io');

var Subscriptions = require('./subscriptions');

var io;

module.exports = (server)=>{
  io = SocketIo(server);
  io.on('connection', async function(socket) {
    log.info(`client ${socket.id} connected to socket.io`);

    const orgKey = socket.handshake.query['razee-org-key'];
    var action = socket.handshake.query.action;
    if (!orgKey) {
      log.error(`no org key.  ${socket.id} disconnected`);
      socket.disconnect(true);
    }

    if(action == 'subscriptions'){
      await Subscriptions(orgKey, socket);
    }
    else{
      throw `unknown socket.handshake.query['action'] "${action}"`;
    }

  });
};
