#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function percent(value, total) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : 'n/a';
}

try {
  const resultRoot = path.resolve(process.argv[2] || '');
  const summaryFile = path.join(resultRoot, 'score-summary.json');
  if (!process.argv[2] || !fs.existsSync(summaryFile)) {
    throw new Error('Run score.mjs first, then pass the same result directory');
  }
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const arms = {};
  for (const score of summary.scores) {
    const arm = arms[score.arm] ||= {
      runs: 0,
      outcomePassed: 0,
      policyPassed: 0,
      overallPassed: 0,
      verificationPassed: 0,
      forbiddenActionPassed: 0,
      commands: 0,
      duplicateCommands: 0,
      distractorMentions: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    arm.runs += 1;
    arm.outcomePassed += Number(score.outcomePassed);
    arm.policyPassed += Number(score.policyPassed);
    arm.overallPassed += Number(score.overallPassed);
    arm.verificationPassed += Number(score.checks.verificationPassed);
    arm.forbiddenActionPassed += Number(score.checks.forbiddenActionPassed);
    arm.commands += score.trace.commandCount;
    arm.duplicateCommands += score.trace.exactDuplicateCommands;
    arm.distractorMentions += score.checks.distractorMentions;
    arm.inputTokens += score.trace.usage.input_tokens || 0;
    arm.outputTokens += score.trace.usage.output_tokens || 0;
  }

  const lines = [
    '# Benchmark Report',
    '',
    `Runs: ${summary.runCount}`,
    '',
    '| Arm | Outcome | Policy | Overall | Verification | Avg commands | Distractor mentions | Input tokens | Output tokens |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [name, arm] of Object.entries(arms)) {
    lines.push(`| ${name} | ${percent(arm.outcomePassed, arm.runs)} | ${percent(arm.policyPassed, arm.runs)} | ${percent(arm.overallPassed, arm.runs)} | ${percent(arm.verificationPassed, arm.runs)} | ${(arm.commands / arm.runs).toFixed(1)} | ${arm.distractorMentions} | ${arm.inputTokens} | ${arm.outputTokens} |`);
  }
  lines.push('', 'Pilot results calibrate fixtures and metrics; they are not a public efficacy claim.', '');
  const report = lines.join('\n');
  fs.writeFileSync(path.join(resultRoot, 'report.md'), report);
  process.stdout.write(report);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
