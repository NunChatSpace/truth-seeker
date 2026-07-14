#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const METRICS = {
  totalTokens: score => (score.trace.usage.input_tokens || 0) + (score.trace.usage.output_tokens || 0),
  inputTokens: score => score.trace.usage.input_tokens || 0,
  outputTokens: score => score.trace.usage.output_tokens || 0,
  reasoningTokens: score => score.trace.usage.reasoning_output_tokens || 0,
  nonReasoningOutputTokens: score =>
    (score.trace.usage.output_tokens || 0) - (score.trace.usage.reasoning_output_tokens || 0),
  commands: score => score.trace.commandCount,
  explorationTokenEstimate: score => score.trace.explorationTokenEstimate,
};

function slope(points) {
  if (points.length < 2) return null;
  const xMean = points.reduce((sum, point) => sum + point.level, 0) / points.length;
  const yMean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const numerator = points.reduce(
    (sum, point) => sum + (point.level - xMean) * (point.value - yMean), 0,
  );
  const denominator = points.reduce((sum, point) => sum + (point.level - xMean) ** 2, 0);
  return denominator ? numerator / denominator : null;
}

function percentReduction(focused, baseline) {
  return baseline ? 100 * (baseline - focused) / baseline : null;
}

function markdown(report) {
  const lines = [
    '# Complexity Calibration', '',
    `Runs: ${report.runCount}. Repetitions per cell: ${report.repetitionsPerCell}.`, '',
    '| Level | Arm | Correct | Verified | Total tokens | Input | Output | Reasoning | Non-reasoning | Commands | Exploration proxy |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.level} (${row.label}) | ${row.arm} | ${row.outcomeRate.toFixed(0)}% | ${row.verificationRate.toFixed(0)}% | ${row.metrics.totalTokens.toFixed(1)} | ${row.metrics.inputTokens.toFixed(1)} | ${row.metrics.outputTokens.toFixed(1)} | ${row.metrics.reasoningTokens.toFixed(1)} | ${row.metrics.nonReasoningOutputTokens.toFixed(1)} | ${row.metrics.commands.toFixed(1)} | ${row.metrics.explorationTokenEstimate.toFixed(1)} |`);
  }
  lines.push('', '## Growth slopes', '', '| Metric | Focused | Baseline | Focused - baseline |', '| --- | ---: | ---: | ---: |');
  for (const [metric, values] of Object.entries(report.slopes)) {
    lines.push(`| ${metric} | ${values.focused.toFixed(1)} | ${values.baseline.toFixed(1)} | ${values.difference.toFixed(1)} |`);
  }
  lines.push('', '## High-complexity paired result', '',
    `- Total-token reduction: ${report.highComplexity.totalTokenReductionPercent.toFixed(1)}%`,
    `- Command reduction: ${report.highComplexity.commandReductionPercent.toFixed(1)}%`,
    `- Directional thresholds passed: ${report.directionalThresholdsPassed ? 'yes' : 'no'}`, '',
    'One repetition per cell is calibration evidence only; it does not provide a confidence interval.', '');
  return lines.join('\n');
}

try {
  const resultRoot = path.resolve(process.argv[2] || '');
  const summaryPath = path.join(resultRoot, 'score-summary.json');
  if (!process.argv[2] || !fs.existsSync(summaryPath)) {
    throw new Error('Usage: node benchmarks/scripts/complexity.mjs benchmarks/results/<run-directory>');
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const scores = summary.scores.filter(score => score.complexity);
  if (!scores.length) throw new Error('No complexity scores found');

  const cells = new Map();
  for (const score of scores) {
    const key = `${score.complexity.level}:${score.arm}`;
    const cell = cells.get(key) || [];
    cell.push(score);
    cells.set(key, cell);
  }
  for (const level of [1, 2, 3]) {
    for (const arm of ['focused', 'baseline']) {
      if (!cells.has(`${level}:${arm}`)) throw new Error(`Missing complexity cell: level ${level} ${arm}`);
    }
  }

  const rows = [];
  for (const level of [1, 2, 3]) {
    for (const arm of ['focused', 'baseline']) {
      const cell = cells.get(`${level}:${arm}`);
      const metrics = Object.fromEntries(Object.entries(METRICS).map(([name, read]) => [
        name,
        cell.reduce((sum, score) => sum + read(score), 0) / cell.length,
      ]));
      rows.push({
        level,
        label: cell[0].complexity.label,
        arm,
        samples: cell.length,
        outcomeRate: 100 * cell.filter(score => score.outcomePassed).length / cell.length,
        verificationRate: 100 * cell.filter(score => score.checks.verificationPassed).length / cell.length,
        metrics,
      });
    }
  }

  const slopes = Object.fromEntries(Object.keys(METRICS).map(metric => {
    const focused = slope(rows.filter(row => row.arm === 'focused').map(row => ({ level: row.level, value: row.metrics[metric] })));
    const baseline = slope(rows.filter(row => row.arm === 'baseline').map(row => ({ level: row.level, value: row.metrics[metric] })));
    return [metric, { focused, baseline, difference: focused - baseline }];
  }));
  const focusedHigh = rows.find(row => row.level === 3 && row.arm === 'focused');
  const baselineHigh = rows.find(row => row.level === 3 && row.arm === 'baseline');
  const highComplexity = {
    totalTokenReductionPercent: percentReduction(
      focusedHigh.metrics.totalTokens, baselineHigh.metrics.totalTokens,
    ),
    commandReductionPercent: percentReduction(
      focusedHigh.metrics.commands, baselineHigh.metrics.commands,
    ),
  };
  const gatesPassed = rows
    .filter(row => row.arm === 'focused')
    .every(row => row.outcomeRate === 100 && row.verificationRate === 100);
  const report = {
    runDirectory: resultRoot,
    runCount: scores.length,
    repetitionsPerCell: Math.min(...rows.map(row => row.samples)),
    rows,
    slopes,
    highComplexity,
    directionalThresholdsPassed: gatesPassed && slopes.totalTokens.difference < 0 &&
      highComplexity.totalTokenReductionPercent >= 20 &&
      highComplexity.commandReductionPercent >= 30,
  };
  fs.writeFileSync(path.join(resultRoot, 'complexity.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(resultRoot, 'complexity.md'), markdown(report));
  process.stdout.write(markdown(report));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
