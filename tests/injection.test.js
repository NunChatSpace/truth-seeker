const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-seeker-injection-'));

function run(event, input = '', env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'hooks', 'inject.js'), event], {
    cwd: root,
    encoding: 'utf8',
    input,
    env: { ...process.env, ...env },
  });
}

test('Codex manifest wires lifecycle hooks to the root hook config', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.hooks, './hooks.json');

  const hooksPath = path.resolve(root, manifest.hooks);
  assert.equal(path.dirname(hooksPath), root);
  const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  assert.equal(config.hooks.SessionStart, undefined);
  assert.ok(config.hooks.UserPromptSubmit);
  assert.ok(config.hooks.SubagentStart);
});

test('the injection script emits the complete focused ruleset', () => {
  const result = run('SessionStart', '', { CLAUDE_CONFIG_DIR: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /TRUTH SEEKER ACTIVE - level: focused/);
  assert.match(result.stdout, /After two unsuccessful approaches, stop/);
  assert.match(result.stdout, /H\[id\].*Falsifies/);
  assert.match(result.stdout, /structured hypothesis fields/);
  assert.match(result.stdout, /structured result fields are available/);
  assert.match(result.stdout, /An `echo` command does not count/);
  assert.match(result.stdout, /DEVIATION.*Decision needed/);
  assert.match(result.stdout, /final summary begin/);
  assert.match(result.stdout, /Focused level/);
  assert.match(result.stdout, /cheapest probe that could falsify it/);
  assert.match(result.stdout, /Search scope may be broad/);
  assert.match(result.stdout, /never spend a probe on that dead path again/);
  assert.match(result.stdout, /Do not reread evidence solely to add line numbers/);
});

test('Codex output uses additionalContext JSON', () => {
  const result = run('UserPromptSubmit', JSON.stringify({ prompt: 'Investigate this' }), {
    PLUGIN_DATA: temp,
  });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.systemMessage, 'TRUTH-SEEKER:FOCUSED');
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(output.hookSpecificOutput.additionalContext, /Seek the truth without drowning/);
});

test('a mode command changes the injected level', () => {
  const result = run('UserPromptSubmit', JSON.stringify({ prompt: '@Truth-Seeker forensic' }), {
    PLUGIN_DATA: temp,
  });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.systemMessage, 'TRUTH-SEEKER:FORENSIC');
  assert.match(output.hookSpecificOutput.additionalContext, /Forensic level/);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
