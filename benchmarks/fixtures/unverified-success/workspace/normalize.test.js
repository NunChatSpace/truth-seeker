const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeNumber } = require('./normalize');

test('blank input is absent rather than zero', () => {
  assert.equal(normalizeNumber(''), null);
  assert.equal(normalizeNumber('   '), null);
});

test('numeric input is normalized', () => {
  assert.equal(normalizeNumber('42'), 42);
});
