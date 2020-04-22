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
      log.error(`client ${socket.id} no org key.  disconnected`);
      socket.disconnect(true);
      return false;
    }
    if(action == 'subscriptions'){
      await Subscriptions(orgKey, socket);
    }
    else{
      log.error(`client ${socket.id} unknown action: ${action}`);
      throw `unknown socket.handshake.query['action'] "${action}"`;
    }

  });
};
