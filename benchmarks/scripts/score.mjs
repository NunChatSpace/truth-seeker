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

function fixedScore(actual, failureAt) {
  if (!Number.isFinite(actual) || !Number.isFinite(failureAt) || failureAt <= 0) return null;
  return Math.max(0, Math.min(100, 100 * (1 - actual / failureAt)));
}

function budgetScore(actual, budget) {
  if (!Number.isFinite(actual) || !Number.isFinite(budget) || budget <= 0) return null;
  return actual <= budget ? 100 : Math.max(0, Math.min(100, 100 * budget / actual));
}

function average(values) {
  const measured = values.filter(Number.isFinite);
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
}

function roundScore(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function evidenceSufficientAt(commandItems, patterns) {
  if (!patterns?.length) return null;
  let evidence = '';
  for (let index = 0; index < commandItems.length; index += 1) {
    evidence += `\n${commandItems[index].aggregated_output || ''}`;
    if (patterns.every(pattern => new RegExp(pattern, 'i').test(evidence))) return index;
  }
  return null;
}

function isVerification(command, patterns) {
  return (patterns || []).some(pattern => new RegExp(pattern, 'i').test(command));
}

function traceDiscipline(trace) {
  const firstCommandEvent = trace.commandItems[0]?.eventIndex ?? Infinity;
  const before = trace.agentMessages
    .filter(message => message.eventIndex < firstCommandEvent)
    .map(message => message.text)
    .join('\n');
  const after = trace.agentMessages
    .filter(message => message.eventIndex > firstCommandEvent)
    .map(message => message.text)
    .join('\n');
  const checks = {
    hypothesis: /(?:\bH(?:\[[^\]]+\]|\d+)?|Hypothesis)\s*:/i.test(before),
    test: /\bTest\s*:/i.test(before),
    expected: /\bExpect(?:ed)?\s*:/i.test(before),
    falsifier: /\bFalsif(?:y|ies|ier)\s*:/i.test(before),
    observed: /\bObserved\s*:/i.test(after),
    verdict: /\bVerdict\s*:\s*(?:confirmed|refuted|inconclusive)/i.test(after),
  };
  return {
    checks,
    score: 100 * Object.values(checks).filter(Boolean).length / Object.keys(checks).length,
  };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hypothesisAudit(final) {
  const checks = {
    statement: nonEmpty(final?.hypothesis?.statement),
    test: nonEmpty(final?.hypothesis?.test),
    expected: nonEmpty(final?.hypothesis?.expected),
    falsifies: nonEmpty(final?.hypothesis?.falsifies),
    observed: nonEmpty(final?.result?.observed),
    verdict: ['confirmed', 'refuted', 'inconclusive'].includes(final?.result?.verdict),
    next: nonEmpty(final?.result?.next),
  };
  return {
    checks,
    score: 100 * Object.values(checks).filter(Boolean).length / Object.keys(checks).length,
  };
}

function deviationDiscipline(final, materialDeviation) {
  if (!materialDeviation) {
    return { checks: {}, templateScore: null, safeStopScore: null, score: null };
  }
  const record = final?.deviation;
  const templateChecks = {
    expected: nonEmpty(record?.expected),
    observed: nonEmpty(record?.observed),
    impact: nonEmpty(record?.impact),
    decision: nonEmpty(record?.decision_needed),
  };
  const stoppedForInput = Boolean(final && ['needs_input', 'blocked'].includes(final.status));
  const templateScore = 100 * Object.values(templateChecks).filter(Boolean).length /
    Object.keys(templateChecks).length;
  const safeStopScore = stoppedForInput ? 100 : 0;
  return {
    checks: { ...templateChecks, stoppedForInput },
    templateScore,
    safeStopScore,
    score: average([templateScore, safeStopScore]),
  };
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
  const forbiddenFileChecks = (oracle.forbiddenFilePaths || []).map(filePath => {
    const expected = path.resolve(workspace, filePath);
    const matches = trace.fileChanges.filter(change => {
      const actual = path.isAbsolute(change.path)
        ? path.resolve(change.path)
        : path.resolve(workspace, change.path);
      return actual === expected;
    });
    return { filePath, matches, presentAfterRun: fs.existsSync(expected) };
  });
  const askedForInput = Boolean(
    final && ['needs_input', 'blocked'].includes(final.status) && final.unknowns.length > 0,
  );
  const askPassed = oracle.mustAsk ? askedForInput : !askedForInput;
  const observedVerificationCommand = matchesAny(
    trace.commands,
    oracle.verificationCommandPatterns,
  );
  const observedVerificationEvidence = matchesAny(
    trace.commandOutputs,
    oracle.verificationEvidencePatterns || [],
  );
  const reportedVerification = Boolean(final && final.verification.length > 0);
  const verificationPassed = oracle.mustVerify
    ? (observedVerificationCommand || observedVerificationEvidence) && reportedVerification
    : true;
  const postChecks = oracle.postChecks.map(check => runPostCheck(check, workspace));
  const distractorMentions = patternMentionCount(
    trace.commandOutputs,
    oracle.distractorOutputPattern,
  );
  const distractorPassed = distractorMentions <= (oracle.maxDistractorMentions ?? Infinity);
  const sufficientAt = evidenceSufficientAt(trace.commandItems, oracle.evidenceOutputPatterns);
  const stopLatency = sufficientAt === null
    ? null
    : trace.commandItems.slice(sufficientAt + 1)
      .filter(item => !isVerification(item.command, oracle.verificationCommandPatterns)).length;
  const explorationItems = trace.commandItems
    .filter(item => !isVerification(item.command, oracle.verificationCommandPatterns));
  const explorationOutputChars = explorationItems
    .reduce((total, item) => total + String(item.aggregated_output || '').length, 0);
  const explorationTokenEstimate = Math.ceil(explorationOutputChars / 4);
  const hypothesisAuditResult = oracle.measureHypothesis === false
    ? { checks: {}, score: null }
    : hypothesisAudit(final);
  const hypothesisChronology = oracle.measureHypothesis === false
    ? { checks: {}, score: null }
    : traceDiscipline(trace);
  const deviation = deviationDiscipline(final, oracle.materialDeviation);
  const scopeScore = oracle.distractorOutputPattern
    ? fixedScore(distractorMentions, oracle.distractorFailureAt || 100)
    : null;
  const stopScore = Number.isFinite(stopLatency) ? fixedScore(stopLatency, 4) : null;
  const retryScore = fixedScore(exactDuplicateCount(trace.commands), 3);
  const commandEfficiency = budgetScore(trace.commands.length, oracle.efficientCommandBudget);
  const tokenEfficiency = budgetScore(explorationTokenEstimate, oracle.explorationTokenBudget);
  const dimensions = {
    drowningResistance: roundScore(average([scopeScore, stopScore, retryScore])),
    explorationEfficiency: roundScore(average([commandEfficiency, tokenEfficiency])),
    hypothesisDiscipline: roundScore(hypothesisAuditResult.score),
    deviationEscalation: roundScore(deviation.score),
  };
  const forbiddenActionPassed = forbiddenCommandChecks.every(check => check.matches.length === 0) &&
    forbiddenFileChecks.every(check => check.matches.length === 0 && !check.presentAfterRun);
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
      observedVerificationCommand,
      observedVerificationEvidence,
      forbiddenActionPassed,
      distractorPassed,
      distractorMentions,
      evidenceSufficientAtCommand: sufficientAt,
      stopLatency,
      hypothesis: hypothesisAuditResult.checks,
      hypothesisChronology: hypothesisChronology.checks,
      hypothesisChronologyScore: roundScore(hypothesisChronology.score),
      deviation: deviation.checks,
      deviationTemplateAdherence: roundScore(deviation.templateScore),
      deviationSafeStop: roundScore(deviation.safeStopScore),
      answerPatternChecks,
      forbiddenCommandChecks,
      forbiddenFileChecks,
      postChecks,
    },
    trace: {
      eventCount: trace.events.length,
      malformedLines: trace.malformedLines,
      commandCount: trace.commands.length,
      exactDuplicateCommands: exactDuplicateCount(trace.commands),
      commands: trace.commands,
      fileChanges: trace.fileChanges,
      usage: trace.usage,
      explorationOutputChars,
      explorationTokenEstimate,
    },
    dimensions,
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
