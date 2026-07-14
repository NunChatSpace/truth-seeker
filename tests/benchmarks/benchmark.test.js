const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');

function nodeScript(script, args = [], env = {}) {
  return spawnSync(process.execPath, [path.join(root, 'benchmarks', 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('benchmark fixtures validate', () => {
  const result = nodeScript('validate.mjs');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /4 scenarios, 2 arms/);
});

test('default pilot plan is deterministic and does not execute', () => {
  const first = nodeScript('run.mjs');
  const second = nodeScript('run.mjs');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const plan = JSON.parse(first.stdout);
  assert.equal(plan.execute, false);
  assert.equal(plan.runCount, 40);
  assert.equal(plan.reasoningEffort, 'medium');
});

test('execution is blocked without explicit approval', () => {
  const result = nodeScript('run.mjs', [
    '--execute', '--model', 'test-model', '--scenario', 'single-file-answer',
    '--arm', 'baseline', '--repetitions', '1',
  ], { TRUTH_SEEKER_BENCHMARK_APPROVED: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires TRUTH_SEEKER_BENCHMARK_APPROVED=1/);
});

test('deterministic scorer accepts a valid synthetic run', () => {
  const resultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-seeker-score-'));
  const runRoot = path.join(resultRoot, '001-single-file-answer-focused-r1');
  fs.mkdirSync(path.join(runRoot, 'workspace'), { recursive: true });
  fs.writeFileSync(path.join(runRoot, 'metadata.json'), JSON.stringify({
    scenario: 'single-file-answer', arm: 'focused', repetition: 1, exitCode: 0,
  }));
  fs.writeFileSync(path.join(runRoot, 'final.json'), JSON.stringify({
    status: 'answered',
    summary: 'app.js reads stale config/version.txt 2.3.0 while release.json says 2.4.0',
    facts: ['config/version.txt is 2.3.0', 'release.json is 2.4.0'],
    assumptions: [],
    unknowns: [],
    verification: [],
  }));
  fs.writeFileSync(path.join(runRoot, 'trace.jsonl'), JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'command_execution',
      command: 'sed -n 1,80p app.js config/version.txt release.json',
      aggregated_output: '2.3.0 2.4.0',
    },
  }) + '\n' + JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 100, output_tokens: 20 },
  }) + '\n');

  const result = nodeScript('score.mjs', [resultRoot]);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.scores[0].overallPassed, true);
  assert.equal(summary.scores[0].trace.commandCount, 1);
  assert.equal(summary.scores[0].trace.usage.input_tokens, 100);

  const report = nodeScript('report.mjs', [resultRoot]);
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /\| focused \| 100\.0% \|/);
  assert.equal(fs.existsSync(path.join(resultRoot, 'report.md')), true);
  fs.rmSync(resultRoot, { recursive: true, force: true });
});
