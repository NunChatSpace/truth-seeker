#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const arms = ['baseline', 'approval-control', 'informed-scope'];
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const reduction = (focused, baseline) => baseline ? 100 * (baseline - focused) / baseline : null;

function markdown(report) {
  const lines = [
    '# Scope Information Gain Calibration', '',
    `Runs: ${report.runCount}. Repetitions per arm: ${report.repetitionsPerArm}.`, '',
    '| Arm | Question gate | Correct | Verified | Commands to false | Output proxy | Raw input | Cached input | Output | Raw total | Uncached-equivalent | Duration ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of report.rows) {
    const question = row.questionGate === null ? '-' : `${row.questionGate.toFixed(0)}%`;
    lines.push(`| ${row.arm} | ${question} | ${row.correctness.toFixed(0)}% | ${row.verification.toFixed(0)}% | ${row.commandsToFalsification.toFixed(1)} | ${row.outputProxy.toFixed(1)} | ${row.inputTokens.toFixed(1)} | ${row.cachedInputTokens.toFixed(1)} | ${row.outputTokens.toFixed(1)} | ${row.rawTotalTokens.toFixed(1)} | ${row.uncachedEquivalentTokens.toFixed(1)} | ${row.durationMs.toFixed(1)} |`);
  }
  lines.push('', '## Informed scope vs baseline', '',
    `- Raw-token reduction: ${report.informedVsBaseline.rawTokenReductionPercent.toFixed(1)}%`,
    `- Commands-to-falsification reduction: ${report.informedVsBaseline.commandsReductionPercent.toFixed(1)}%`,
    `- Output-proxy reduction: ${report.informedVsBaseline.outputProxyReductionPercent.toFixed(1)}%`,
    `- Directional thresholds passed: ${report.directionalThresholdsPassed ? 'yes' : 'no'}`, '',
    'Raw total includes every turn. Uncached-equivalent = input - cached input + output. One repetition has no confidence interval.', '');
  return lines.join('\n');
}

try {
  const resultRoot = path.resolve(process.argv[2] || '');
  const summaryPath = path.join(resultRoot, 'score-summary.json');
  if (!process.argv[2] || !fs.existsSync(summaryPath)) {
    throw new Error('Usage: node benchmarks/scripts/scope-gain.mjs benchmarks/results/<run-directory>');
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const scores = summary.scores.filter(score => score.scenario === 'scope-information-gain-complex');
  const rows = arms.map(arm => {
    const cell = scores.filter(score => score.arm === arm);
    if (!cell.length) throw new Error(`Missing scope-information-gain arm: ${arm}`);
    const usage = key => mean(cell.map(score => score.trace.usage[key] || 0));
    const inputTokens = usage('input_tokens');
    const cachedInputTokens = usage('cached_input_tokens');
    const outputTokens = usage('output_tokens');
    return {
      arm,
      samples: cell.length,
      questionGate: arm === 'baseline' ? null :
        100 * cell.filter(score => score.checks.scopeApprovalPassed).length / cell.length,
      correctness: 100 * cell.filter(score => score.outcomePassed).length / cell.length,
      verification: 100 * cell.filter(score => score.checks.verificationPassed).length / cell.length,
      falsificationAudit: mean(cell.map(score => score.checks.falsificationAuditScore || 0)),
      commandsToFalsification: mean(cell.map(score => score.checks.commandsToFalsification)),
      outputProxy: mean(cell.map(score => score.trace.falsificationTokenEstimate)),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      rawTotalTokens: inputTokens + outputTokens,
      uncachedEquivalentTokens: Math.max(0, inputTokens - cachedInputTokens) + outputTokens,
      durationMs: mean(cell.map(score => score.trace.durationMs || 0)),
    };
  });
  const baseline = rows.find(row => row.arm === 'baseline');
  const informed = rows.find(row => row.arm === 'informed-scope');
  const informedVsBaseline = {
    rawTokenReductionPercent: reduction(informed.rawTotalTokens, baseline.rawTotalTokens),
    commandsReductionPercent: reduction(informed.commandsToFalsification, baseline.commandsToFalsification),
    outputProxyReductionPercent: reduction(informed.outputProxy, baseline.outputProxy),
  };
  const directionalThresholdsPassed = informed.questionGate === 100 &&
    informed.correctness === 100 && informed.verification === 100 && informed.falsificationAudit === 100 &&
    informedVsBaseline.rawTokenReductionPercent >= 20 &&
    informedVsBaseline.commandsReductionPercent >= 30 &&
    informedVsBaseline.outputProxyReductionPercent >= 30;
  const report = {
    runDirectory: resultRoot,
    runCount: scores.length,
    repetitionsPerArm: Math.min(...rows.map(row => row.samples)),
    rows,
    informedVsBaseline,
    directionalThresholdsPassed,
  };
  fs.writeFileSync(path.join(resultRoot, 'scope-gain.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(resultRoot, 'scope-gain.md'), markdown(report));
  process.stdout.write(markdown(report));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
