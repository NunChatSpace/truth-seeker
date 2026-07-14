const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-seeker-test-'));
process.env.PLUGIN_DATA = temp;

const runtime = require('../hooks/runtime');

test('defaults to focused and never recognizes off', () => {
  assert.equal(runtime.readMode(), 'focused');
  assert.equal(runtime.normalizeMode('off'), null);
  assert.equal(runtime.extractMode('/truth-seeker off'), null);
});

test('recognizes supported mode commands', () => {
  assert.equal(runtime.extractMode('/truth-seeker deep'), 'deep');
  assert.equal(runtime.extractMode('@Truth-Seeker forensic'), 'forensic');
  assert.equal(runtime.extractMode('$truth-seeker:focused'), 'focused');
});

test('persists only valid modes', () => {
  assert.equal(runtime.writeMode('deep'), true);
  assert.equal(runtime.readMode(), 'deep');
  assert.equal(runtime.writeMode('off'), false);
  assert.equal(runtime.readMode(), 'deep');
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
