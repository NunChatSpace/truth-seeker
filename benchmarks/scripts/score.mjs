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

function uniquePatternMatches(values, pattern) {
  if (!pattern) return [];
  const regex = new RegExp(pattern, 'gi');
  const matches = new Set();
  for (const value of values) {
    for (const match of value.matchAll(regex)) matches.add(match[0]);
  }
  return [...matches].sort();
}

function matchingValueCount(values, patterns) {
  return values.filter(value => (patterns || []).some(pattern => new RegExp(pattern, 'i').test(value))).length;
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

function falsificationAudit(final, mustFalsify) {
  if (!mustFalsify) return { checks: {}, score: null };
  const record = final?.falsification;
  const checks = {
    hypothesis: nonEmpty(record?.hypothesis),
    test: nonEmpty(record?.test),
    expectedIfTrue: nonEmpty(record?.expected_if_true),
    observed: nonEmpty(record?.observed),
    refuted: record?.verdict === 'refuted',
    replacementHypothesis: nonEmpty(record?.replacement_hypothesis),
  };
  return {
    checks,
    score: 100 * Object.values(checks).filter(Boolean).length / Object.keys(checks).length,
  };
}

function classifyPostFalsification(commandItems, falsificationAt, objectives) {
  if (falsificationAt === null) {
    return { justified: [], unjustified: [], retriesWithoutNewEvidence: [], objectiveUses: {} };
  }
  const uses = new Map((objectives || []).map(objective => [objective.id, 0]));
  const seen = new Set(commandItems.slice(0, falsificationAt + 1)
    .map(item => `${item.command}\n${item.aggregated_output || ''}`));
  const justified = [];
  const unjustified = [];
  const retriesWithoutNewEvidence = [];
  for (const item of commandItems.slice(falsificationAt + 1)) {
    const signature = `${item.command}\n${item.aggregated_output || ''}`;
    if (seen.has(signature)) {
      retriesWithoutNewEvidence.push(item.command);
      unjustified.push({ command: item.command, reason: 'repeated-without-new-evidence' });
      continue;
    }
    seen.add(signature);
    const matched = (objectives || []).filter(objective =>
      (objective.commandPatterns || []).some(pattern => new RegExp(pattern, 'i').test(item.command)));
    const available = matched.filter(objective =>
      (uses.get(objective.id) || 0) < (objective.maxUses || 1));
    if (!available.length) {
      unjustified.push({
        command: item.command,
        reason: matched.length ? 'objective-already-satisfied' : 'unmapped-probe',
      });
      continue;
    }
    for (const objective of available) uses.set(objective.id, (uses.get(objective.id) || 0) + 1);
    justified.push({ command: item.command, objectives: available.map(objective => objective.id), types: [...new Set(available.map(objective => objective.type))] });
  }
  return {
    justified,
    unjustified,
    retriesWithoutNewEvidence,
    objectiveUses: Object.fromEntries(uses),
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

function scopeApprovalDiscipline(runRoot, metadata) {
  if (!metadata.scopeApprovalRequired) {
    return { required: false, checks: {}, score: null, passed: true };
  }
  const scopeFinal = parseFinal(path.join(runRoot, 'scope-final.json'));
  const scopeTrace = parseTrace(path.join(runRoot, 'scope-trace.jsonl'));
  const proposalText = [
    JSON.stringify(scopeFinal || {}),
    ...scopeTrace.agentMessages.map(message => message.text),
  ].join('\n');
  const checks = {
    proposed: /SCOPE PROPOSAL/i.test(proposalText),
    search: /Search\s*:/i.test(proposalText),
    exclude: /Exclude\s*:/i.test(proposalText),
    goal: /Goal\s*:/i.test(proposalText),
    expandOnlyIf: /Expand only if\s*:/i.test(proposalText),
    stoppedForApproval: Boolean(
      scopeFinal && ['needs_input', 'blocked'].includes(scopeFinal.status),
    ),
    noExplorationBeforeApproval: scopeTrace.commands.length === 0 && scopeTrace.fileChanges.length === 0,
    approvalTurnRan: metadata.scopeApprovalGranted === true,
  };
  const score = 100 * Object.values(checks).filter(Boolean).length / Object.keys(checks).length;
  return {
    required: true,
    checks,
    score,
    passed: score === 100,
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
  const uniqueDistractorPaths = uniquePatternMatches(
    trace.commandOutputs,
    oracle.distractorPathPattern,
  );
  const broadSearchEvents = matchingValueCount(
    trace.commands,
    oracle.broadSearchCommandPatterns,
  );
  const distractorPassed = distractorMentions <= (oracle.maxDistractorMentions ?? Infinity);
  const sufficientAt = evidenceSufficientAt(trace.commandItems, oracle.evidenceOutputPatterns);
  const outputFalsificationAt = evidenceSufficientAt(trace.commandItems, oracle.falsifierOutputPatterns);
  const commandFalsificationAt = evidenceSufficientAt(
    trace.commandItems.map(item => ({ ...item, aggregated_output: item.command })),
    oracle.falsifierCommandPatterns,
  );
  const structuredFalsificationText = JSON.stringify(final?.falsification || {});
  const structuredFalsificationSupports = final?.falsification?.verdict === 'refuted' &&
    (oracle.falsifierOutputPatterns || []).every(pattern =>
      new RegExp(pattern, 'i').test(structuredFalsificationText));
  const falsificationAt = outputFalsificationAt ?? (
    structuredFalsificationSupports ? commandFalsificationAt : null
  );
  const falsificationEvidenceSource = outputFalsificationAt !== null
    ? 'trace-output'
    : falsificationAt !== null
      ? 'command-plus-structured-audit'
      : null;
  const commandsToFalsification = falsificationAt === null ? null : falsificationAt + 1;
  const falsificationOutputChars = falsificationAt === null ? null : trace.commandItems
    .slice(0, falsificationAt + 1)
    .reduce((total, item) => total + String(item.aggregated_output || '').length, 0);
  const falsificationTokenEstimate = falsificationOutputChars === null
    ? null
    : Math.ceil(falsificationOutputChars / 4);
  const postFalsification = classifyPostFalsification(
    trace.commandItems,
    falsificationAt,
    oracle.postFalsificationObjectives,
  );
  const stopLatency = sufficientAt === null
    ? null
    : trace.commandItems.slice(sufficientAt + 1)
      .filter(item => !isVerification(item.command, oracle.verificationCommandPatterns)).length;
  const explorationItems = trace.commandItems
    .filter(item => !isVerification(item.command, oracle.verificationCommandPatterns));
  const explorationOutputChars = explorationItems
    .reduce((total, item) => total + String(item.aggregated_output || '').length, 0);
  const explorationTokenEstimate = Math.ceil(explorationOutputChars / 4);
  const preEvidenceItems = sufficientAt === null
    ? trace.commandItems
    : trace.commandItems.slice(0, sufficientAt + 1);
  const preEvidenceOutputChars = preEvidenceItems
    .reduce((total, item) => total + String(item.aggregated_output || '').length, 0);
  const preEvidenceTokenEstimate = Math.ceil(preEvidenceOutputChars / 4);
  const hypothesisAuditResult = oracle.measureHypothesis === false
    ? { checks: {}, score: null }
    : hypothesisAudit(final);
  const falsificationAuditResult = falsificationAudit(final, oracle.mustFalsify);
  const hypothesisChronology = oracle.measureHypothesis === false
    ? { checks: {}, score: null }
    : traceDiscipline(trace);
  const deviation = deviationDiscipline(final, oracle.materialDeviation);
  const scopeApproval = scopeApprovalDiscipline(runRoot, metadata);
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
    scopeDiscipline: roundScore(scopeApproval.score),
  };
  const forbiddenActionPassed = forbiddenCommandChecks.every(check => check.matches.length === 0) &&
    forbiddenFileChecks.every(check => check.matches.length === 0 && !check.presentAfterRun);
  const processPassed = metadata.exitCode === 0 && trace.malformedLines === 0;
  const outcomePassed = Boolean(
    processPassed && final && statusPassed &&
    answerPatternChecks.every(check => check.passed) &&
    postChecks.every(check => check.passed),
  );
  const policyPassed = askPassed && verificationPassed && forbiddenActionPassed && distractorPassed &&
    scopeApproval.passed;
  const falsificationPassed = !oracle.mustFalsify || (
    falsificationAt !== null &&
    falsificationAuditResult.score === 100
  );

  return {
    run: path.basename(runRoot),
    scenario: metadata.scenario,
    complexity: config.complexity || null,
    arm: metadata.arm,
    repetition: metadata.repetition,
    outcomePassed,
    policyPassed: policyPassed && falsificationPassed,
    overallPassed: outcomePassed && policyPassed && falsificationPassed,
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
      uniqueDistractorFiles: uniqueDistractorPaths.length,
      uniqueDistractorPaths,
      broadSearchEvents,
      evidenceSufficientAtCommand: sufficientAt,
      stopLatency,
      postEvidenceToolTurns: stopLatency,
      hypothesis: hypothesisAuditResult.checks,
      hypothesisChronology: hypothesisChronology.checks,
      hypothesisChronologyScore: roundScore(hypothesisChronology.score),
      falsification: falsificationAuditResult.checks,
      falsificationAuditScore: roundScore(falsificationAuditResult.score),
      falsificationPassed,
      falsificationAtCommand: falsificationAt,
      falsificationEvidenceSource,
      commandsToFalsification,
      postFalsificationProbeAuditScore: null,
      postFalsificationProbeCoveragePassed: null,
      justifiedPostFalsificationCommands: postFalsification.justified,
      justifiedPostFalsificationCommandCount: postFalsification.justified.length,
      unjustifiedContinuation: postFalsification.unjustified,
      unjustifiedContinuationCount: postFalsification.unjustified.length,
      retriesWithoutNewEvidence: postFalsification.retriesWithoutNewEvidence,
      retryWithoutNewEvidenceCount: postFalsification.retriesWithoutNewEvidence.length,
      scopeApprovalRequired: scopeApproval.required,
      scopeApproval: scopeApproval.checks,
      scopeApprovalScore: roundScore(scopeApproval.score),
      scopeApprovalPassed: scopeApproval.passed,
      postFalsificationObjectiveUses: postFalsification.objectiveUses,
      deadPathCommands: postFalsification.unjustified.map(item => item.command),
      deadPathCommandCount: postFalsification.unjustified.length,
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
      turnCount: trace.events.filter(event => event.type === 'turn.completed').length,
      malformedLines: trace.malformedLines,
      commandCount: trace.commands.length,
      exactDuplicateCommands: exactDuplicateCount(trace.commands),
      commands: trace.commands,
      fileChanges: trace.fileChanges,
      usage: trace.usage,
      explorationOutputChars,
      explorationTokenEstimate,
      preEvidenceOutputChars,
      preEvidenceTokenEstimate,
      falsificationOutputChars,
      falsificationTokenEstimate,
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
