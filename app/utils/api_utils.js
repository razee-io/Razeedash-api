const encryptOrgData = require('./orgs.js').encryptOrgData;

const requireAuth = async(req, res, next) => {
  const userId = req.get('x-user-id');
  const apiKey = req.get('x-api-key');

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

const encryptResource = async(req) => {
  return new Promise((resolve, reject) => {
    let content = '';
    req.on('data', (data) => {
      content += data;
    });
    req.on('end', () => {
      try {
        const encrypted = encryptOrgData(req.org, content);
        resolve(encrypted);
      } catch (error) {
        reject(error);
      }
    });
  });
};

module.exports = {
  encryptResource,
  requireAuth
};
