#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const reduction = (focused, baseline) => baseline ? 100 * (baseline - focused) / baseline : null;

function markdown(report) {
  const lines = [
    '# Fast Falsification Calibration', '',
    `Runs: ${report.runCount}. Repetitions per cell: ${report.repetitionsPerCell}.`, '',
    '| Level | Arm | Scope approval | Correct | Verified | Falsification audit | Commands to false | Output proxy to false | Necessary post-false | Unjustified continuation | Retry without evidence | Total tokens |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of report.rows) {
    const scope = row.scopeApproval === null ? '-' : `${row.scopeApproval.toFixed(0)}%`;
    lines.push(`| ${row.level} (${row.label}) | ${row.arm} | ${scope} | ${row.correctness.toFixed(0)}% | ${row.verification.toFixed(0)}% | ${row.falsificationAudit.toFixed(1)} | ${row.commandsToFalsification.toFixed(1)} | ${row.falsificationTokenEstimate.toFixed(1)} | ${row.justifiedPostFalsification.toFixed(1)} | ${row.unjustifiedContinuation.toFixed(1)} | ${row.retryWithoutEvidence.toFixed(1)} | ${row.totalTokens.toFixed(1)} |`);
  }
  lines.push('', '## High-complexity paired result', '',
    `- Commands-to-falsification reduction: ${report.highComplexity.commandsReductionPercent.toFixed(1)}%`,
    `- Output-proxy-to-falsification reduction: ${report.highComplexity.tokenProxyReductionPercent.toFixed(1)}%`,
    `- Focused necessary post-false probes: ${report.highComplexity.focusedJustifiedPostFalsification.toFixed(1)}`,
    `- Focused unjustified continuation: ${report.highComplexity.focusedUnjustifiedContinuation.toFixed(1)}`,
    `- Focused retry without new evidence: ${report.highComplexity.focusedRetryWithoutEvidence.toFixed(1)}`,
    `- Focused falsification audit: ${report.highComplexity.focusedFalsificationAudit.toFixed(1)}`,
    `- Directional thresholds passed: ${report.directionalThresholdsPassed ? 'yes' : 'no'}`, '',
    'Tool-output token proxy is not model token usage. One repetition per cell has no confidence interval.', '');
  return lines.join('\n');
}

try {
  const resultRoot = path.resolve(process.argv[2] || '');
  const summaryPath = path.join(resultRoot, 'score-summary.json');
  if (!process.argv[2] || !fs.existsSync(summaryPath)) {
    throw new Error('Usage: node benchmarks/scripts/falsification.mjs benchmarks/results/<run-directory>');
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const scores = summary.scores.filter(score => score.scenario.startsWith('fast-false-'));
  if (!scores.length) throw new Error('No fast-false scores found');

  const rows = [];
  for (const level of [1, 2, 3]) {
    for (const arm of ['focused', 'baseline']) {
      const cell = scores.filter(score => score.complexity?.level === level && score.arm === arm);
      if (!cell.length) throw new Error(`Missing fast-false cell: level ${level} ${arm}`);
      if (cell.some(score => !Number.isFinite(score.checks.commandsToFalsification))) {
        throw new Error(`Missing falsification evidence: level ${level} ${arm}`);
      }
      rows.push({
        level,
        label: cell[0].complexity.label,
        arm,
        samples: cell.length,
        scopeApproval: cell.some(score => score.checks.scopeApprovalRequired)
          ? 100 * cell.filter(score => score.checks.scopeApprovalPassed).length / cell.length
          : null,
        correctness: 100 * cell.filter(score => score.outcomePassed).length / cell.length,
        verification: 100 * cell.filter(score => score.checks.verificationPassed).length / cell.length,
        falsificationAudit: mean(cell.map(score => score.checks.falsificationAuditScore || 0)),
        commandsToFalsification: mean(cell.map(score => score.checks.commandsToFalsification)),
        falsificationTokenEstimate: mean(cell.map(score => score.trace.falsificationTokenEstimate)),
        justifiedPostFalsification: mean(cell.map(score => score.checks.justifiedPostFalsificationCommandCount || 0)),
        unjustifiedContinuation: mean(cell.map(score => score.checks.unjustifiedContinuationCount || 0)),
        retryWithoutEvidence: mean(cell.map(score => score.checks.retryWithoutNewEvidenceCount || 0)),
        totalTokens: mean(cell.map(score =>
          (score.trace.usage.input_tokens || 0) + (score.trace.usage.output_tokens || 0))),
        broadSearchEvents: mean(cell.map(score => score.checks.broadSearchEvents || 0)),
        uniqueDistractorFiles: mean(cell.map(score => score.checks.uniqueDistractorFiles || 0)),
      });
    }
  }

  const focused = rows.find(row => row.level === 3 && row.arm === 'focused');
  const baseline = rows.find(row => row.level === 3 && row.arm === 'baseline');
  const highComplexity = {
    commandsReductionPercent: reduction(focused.commandsToFalsification, baseline.commandsToFalsification),
    tokenProxyReductionPercent: reduction(focused.falsificationTokenEstimate, baseline.falsificationTokenEstimate),
    focusedJustifiedPostFalsification: focused.justifiedPostFalsification,
    focusedUnjustifiedContinuation: focused.unjustifiedContinuation,
    focusedRetryWithoutEvidence: focused.retryWithoutEvidence,
    focusedFalsificationAudit: focused.falsificationAudit,
  };
  const focusedGates = rows.filter(row => row.arm === 'focused')
    .every(row => row.scopeApproval === 100 && row.correctness === 100 && row.verification === 100 &&
      row.falsificationAudit === 100);
  const report = {
    runDirectory: resultRoot,
    runCount: scores.length,
    repetitionsPerCell: Math.min(...rows.map(row => row.samples)),
    rows,
    highComplexity,
    directionalThresholdsPassed: focusedGates &&
      highComplexity.commandsReductionPercent >= 30 &&
      highComplexity.tokenProxyReductionPercent >= 30,
  };
  fs.writeFileSync(path.join(resultRoot, 'falsification.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(resultRoot, 'falsification.md'), markdown(report));
  process.stdout.write(markdown(report));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
