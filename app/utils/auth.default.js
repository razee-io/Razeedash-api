
module.exports = class DefaultAuth {

  constructor() {
    this._name = 'Default RBAC';
  }
    
  rbac(action, type) {
    return async(req, res, next) => {
      const userId = req.get('x-user-id');
      const apiKey = req.get('x-api-key');
    
      req.log.debug({name: this._name, action, type, req_id: req.id}, 'rbac enter...');
    
      if (!userId || !apiKey) {
        res.status(401).send('x-user-id and x-api-key required');
        return;
      }
    
      const Users = req.db.collection('users');
      const user = await Users.findOne({ _id: userId, apiKey: apiKey });
    
      if (!user) {
        res.sendStatus(403);
        return;
      }
      next();
    };
  }
};
