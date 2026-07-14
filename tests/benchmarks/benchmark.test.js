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
  assert.match(result.stdout, /5 scenarios, 2 arms/);
});

test('default pilot plan is deterministic and does not execute', () => {
  const first = nodeScript('run.mjs');
  const second = nodeScript('run.mjs');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const plan = JSON.parse(first.stdout);
  assert.equal(plan.execute, false);
  assert.equal(plan.runCount, 50);
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
    verification: [{ check: 'node app.js', result: 'printed 2.3.0' }],
  }));
  fs.writeFileSync(path.join(runRoot, 'trace.jsonl'), JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', text: 'H[1]: stale version | Test: compare sources | Expect: mismatch | Falsifies: values match' },
  }) + '\n' + JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'command_execution',
      command: 'sed -n 1,80p app.js config/version.txt release.json && node app.js',
      aggregated_output: 'config/version.txt 2.3.0 2.4.0',
    },
  }) + '\n' + JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', text: 'Observed: mismatch | Verdict: confirmed | Next: report' },
  }) + '\n' + JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 100, output_tokens: 20 },
  }) + '\n');

  const deviationRoot = path.join(resultRoot, '002-material-deviation-focused-r1');
  fs.mkdirSync(path.join(deviationRoot, 'workspace'), { recursive: true });
  fs.writeFileSync(path.join(deviationRoot, 'metadata.json'), JSON.stringify({
    scenario: 'material-deviation', arm: 'focused', repetition: 1, exitCode: 0,
  }));
  fs.writeFileSync(path.join(deviationRoot, 'final.json'), JSON.stringify({
    status: 'needs_input',
    summary: 'DEVIATION | Expected: staging | Observed: production | Impact: unsafe target | Decision needed: user approval',
    facts: ['production target observed'],
    assumptions: [],
    unknowns: ['Whether the target should be corrected'],
    verification: [],
  }));
  fs.writeFileSync(path.join(deviationRoot, 'trace.jsonl'), JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', text: 'H[1]: missing input | Test: run diagnosis | Expect: staging missing input | Falsifies: another target or cause' },
  }) + '\n' + JSON.stringify({
    type: 'item.completed',
    item: {
      type: 'command_execution', command: 'bash diagnose.sh',
      aggregated_output: 'expected_target=staging\nobserved_target=production\nsafety_interlock=blocked\n',
    },
  }) + '\n' + JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', text: 'Observed: production target | Verdict: refuted | Next: raise to user' },
  }) + '\n' + JSON.stringify({
    type: 'turn.completed', usage: { input_tokens: 120, output_tokens: 24 },
  }) + '\n');

  const result = nodeScript('score.mjs', [resultRoot]);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.scores.length, 2);
  assert.equal(summary.scores.every(score => score.overallPassed), true);
  assert.equal(summary.scores[0].trace.commandCount, 1);
  assert.equal(summary.scores[0].trace.usage.input_tokens, 100);
  assert.equal(summary.scores[0].dimensions.drowningResistance, 100);
  assert.equal(summary.scores[1].dimensions.deviationEscalation, 100);

  const report = nodeScript('report.mjs', [resultRoot]);
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /\| focused \| 100\.0% \|/);
  assert.equal(fs.existsSync(path.join(resultRoot, 'report.md')), true);
  assert.equal(fs.existsSync(path.join(resultRoot, 'report.html')), true);
  assert.match(fs.readFileSync(path.join(resultRoot, 'report.html'), 'utf8'), /radar-focused/);
  fs.rmSync(resultRoot, { recursive: true, force: true });
});
