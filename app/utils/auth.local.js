

const { models } = require('../apollo/models');
const { TYPES } = require('./auth.consts');

const whoIs = me => { 
  if (me === null || me === undefined) return 'null';
  if (me.email) return me.email;
  if (me.identifier) return me.identifier;
  return me._id;
};

module.exports = class LocalAuth {

  constructor() {
    this._name = 'Local RBAC';
  }
      
  rbac(action, type) {
    return async(req, res, next) => {
      const req_id = req.id;
      req.log.debug({name: this._name, action, type, req_id}, 'rbac enter...');
    
      const me = await models.User.getMeFromRequest(req);
    
      if (!me) {
        res.status(403).send('could not locate the user.');
        return;
      }
    
      const org_id = req.org._id;
      var attributes = null;
    
      if (type === TYPES.CHANNEL && req.params.channelName) {
        attributes = {channelName: req.params.channelName};
      } 
      if (type === TYPES.SUBSCRIPTION && req.params.id) {
        attributes = {subscriptionId: req.params.id};
      } 
    
      if (!(await models.User.isAuthorized(me, org_id, action, type, attributes, req_id))) {
        req.log.debug({name: this._name, req_id, me: whoIs(me), org_id, action, type, attributes}, 'rbacAuth permission denied - 401');
        res.status(401).send('Permission denied.');
      }
    
      req.log.debug({name: this._name, action, type, req_id, attributes}, 'rbacAuth permission granted - 200');
    
      next();
    };
  }
};