/* eslint-env node, mocha */
const assert = require('assert');
const rewire = require('rewire');
const bunyan = rewire('./bunyan');

const responseCodeMapper = bunyan.__get__('responseCodeMapper');

describe('utils', () => {
  describe('bunyan', () => {
    describe('responseCodeMapper', () => {
      it('error', async () => {
        assert.equal(responseCodeMapper(500), 'error');
      });
      it('warn', async () => {
        assert.equal(responseCodeMapper(400), 'warn');
        assert.equal(responseCodeMapper(404), 'warn');
      });
      it('info', async () => {
        assert.equal(responseCodeMapper(200), 'info');
      });
    });
  });
});