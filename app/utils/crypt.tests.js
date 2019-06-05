/* eslint-env node, mocha */
const assert = require('assert');

let tokenCrypt = require('./crypt');


describe('utils', () => {
  describe('crypt', () => {
    it('should encrypt and decrypt', ()=> {
      const token = 'abcdefg';
      const data = 'my secret';
      const encode = tokenCrypt.encrypt(data, token );
      assert.notEqual(encode, data);
      const decode = tokenCrypt.decrypt(encode, token);
      assert.equal(decode, data);
    });
  });
});
