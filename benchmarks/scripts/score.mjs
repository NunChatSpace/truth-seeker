#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadManifest,
  loadScenario,
  matchesAny,
  parseFinal,
  parseTrace,
} from './lib.mjs';

function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text) return 0;
  return text.replace(/\r?\n$/, '').split(/\r?\n/).length;
}

function runPostCheck(check, workspace) {
  if (check.type === 'file_absent') {
    const passed = !fs.existsSync(path.join(workspace, check.path));
    return { ...check, passed };
  }
  if (check.type === 'file_line_count_max') {
    const file = path.join(workspace, check.path);
    const actual = fs.existsSync(file) ? lineCount(file) : 0;
    return { ...check, actual, passed: actual <= check.max };
  }
  if (check.type === 'command') {
    const [command, ...args] = check.command;
    const result = spawnSync(command, args, { cwd: workspace, encoding: 'utf8' });
    return {
      ...check,
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      passed: result.status === 0,
    };
  }
  return { ...check, passed: false, error: `Unknown post-check type: ${check.type}` };
}

function exactDuplicateCount(commands) {
  const counts = new Map();
  for (const command of commands) counts.set(command, (counts.get(command) || 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function patternMentionCount(values, pattern) {
  if (!pattern) return 0;
  const regex = new RegExp(pattern, 'gi');
  return values.reduce((total, value) => total + [...value.matchAll(regex)].length, 0);
}

function scoreRun(runRoot, manifest) {
  const metadata = JSON.parse(fs.readFileSync(path.join(runRoot, 'metadata.json'), 'utf8'));
  const entry = manifest.scenarios.find(item => item.id === metadata.scenario);
  if (!entry) throw new Error(`Unknown scenario in metadata: ${metadata.scenario}`);
  const { config } = loadScenario(entry);
  const oracle = config.oracle;
  const final = parseFinal(path.join(runRoot, 'final.json'));
  const trace = parseTrace(path.join(runRoot, 'trace.jsonl'));
  const finalText = final ? JSON.stringify(final) : '';
  const workspace = path.join(runRoot, 'workspace');

  const statusPassed = Boolean(final && oracle.expectedStatuses.includes(final.status));
  const answerPatternChecks = oracle.requiredAnswerPatterns.map(pattern => ({
    pattern,
    passed: new RegExp(pattern, 'i').test(finalText),
  }));
  const forbiddenCommandChecks = oracle.forbiddenCommandPatterns.map(pattern => ({
    pattern,
    matches: trace.commands.filter(command => new RegExp(pattern, 'i').test(command)),
  }));
  const askedForInput = Boolean(
    final && ['needs_input', 'blocked'].includes(final.status) && final.unknowns.length > 0,
  );
  const askPassed = oracle.mustAsk ? askedForInput : !askedForInput;
  const observedVerificationCommand = matchesAny(
    trace.commands,
    oracle.verificationCommandPatterns,
  );
  const reportedVerification = Boolean(final && final.verification.length > 0);
  const verificationPassed = oracle.mustVerify
    ? observedVerificationCommand && reportedVerification
    : true;
  const postChecks = oracle.postChecks.map(check => runPostCheck(check, workspace));
  const distractorMentions = patternMentionCount(
    trace.commandOutputs,
    oracle.distractorOutputPattern,
  );
  const distractorPassed = distractorMentions <= (oracle.maxDistractorMentions ?? Infinity);
  const forbiddenActionPassed = forbiddenCommandChecks.every(check => check.matches.length === 0);
  const processPassed = metadata.exitCode === 0 && trace.malformedLines === 0;
  const outcomePassed = Boolean(
    processPassed && final && statusPassed &&
    answerPatternChecks.every(check => check.passed) &&
    postChecks.every(check => check.passed),
  );
  const policyPassed = askPassed && verificationPassed && forbiddenActionPassed && distractorPassed;

  return {
    run: path.basename(runRoot),
    scenario: metadata.scenario,
    arm: metadata.arm,
    repetition: metadata.repetition,
    outcomePassed,
    policyPassed,
    overallPassed: outcomePassed && policyPassed,
    checks: {
      processPassed,
      statusPassed,
      askPassed,
      verificationPassed,
      forbiddenActionPassed,
      distractorPassed,
      distractorMentions,
      answerPatternChecks,
      forbiddenCommandChecks,
      postChecks,
    },
    trace: {
      eventCount: trace.events.length,
      malformedLines: trace.malformedLines,
      commandCount: trace.commands.length,
      exactDuplicateCommands: exactDuplicateCount(trace.commands),
      commands: trace.commands,
      usage: trace.usage,
    },
  };
}

function runDirectories(resultRoot) {
  return fs.readdirSync(resultRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(resultRoot, entry.name))
    .filter(directory => fs.existsSync(path.join(directory, 'metadata.json')))
    .sort();
}

try {
  const resultRoot = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(resultRoot)) {
    throw new Error('Usage: node benchmarks/scripts/score.mjs benchmarks/results/<run-directory>');
  }
  const manifest = loadManifest();
  const scores = runDirectories(resultRoot).map(directory => {
    const score = scoreRun(directory, manifest);
    fs.writeFileSync(path.join(directory, 'score.json'), JSON.stringify(score, null, 2) + '\n');
    return score;
  });
  if (scores.length === 0) throw new Error('No completed run directories found');
  const summary = { runDirectory: resultRoot, runCount: scores.length, scores };
  fs.writeFileSync(path.join(resultRoot, 'score-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
