#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  benchmarkRoot,
  loadManifest,
  loadScenario,
  projectRoot,
} from './lib.mjs';

function usage() {
  return `Usage: node benchmarks/scripts/run.mjs [options]

Options:
  --arm baseline|focused|all   Arm selection (default: all)
  --scenario ID|all           Scenario selection (default: all)
  --repetitions N             Override manifest repetitions
  --seed N                    Override manifest shuffle seed
  --model MODEL               Model override (default: manifest defaultModel)
  --reasoning LEVEL           Reasoning effort (default: manifest value)
  --execute                   Invoke Codex; otherwise print the plan only
  --help                      Show this help

Execution also requires TRUTH_SEEKER_BENCHMARK_APPROVED=1.`;
}

function parseArgs(argv) {
  const options = {
    arm: 'all',
    scenario: 'all',
    repetitions: null,
    seed: null,
    model: null,
    reasoning: null,
    execute: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--arm') options.arm = argv[++index];
    else if (arg === '--scenario') options.scenario = argv[++index];
    else if (arg === '--repetitions') options.repetitions = Number(argv[++index]);
    else if (arg === '--seed') options.seed = Number(argv[++index]);
    else if (arg === '--model') options.model = argv[++index];
    else if (arg === '--reasoning') options.reasoning = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffled(items, seed) {
  const result = [...items];
  const random = randomFromSeed(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function buildPlan(manifest, options) {
  const armNames = options.arm === 'all' ? Object.keys(manifest.arms) : [options.arm];
  const scenarios = options.scenario === 'all'
    ? manifest.scenarios
    : manifest.scenarios.filter(item => item.id === options.scenario);
  const repetitions = options.repetitions ?? manifest.defaultRepetitions;

  if (armNames.some(name => !manifest.arms[name])) throw new Error(`Unknown arm: ${options.arm}`);
  if (scenarios.length === 0) throw new Error(`Unknown scenario: ${options.scenario}`);
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('Repetitions must be a positive integer');

  const runs = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const scenario of scenarios) {
      for (const arm of armNames) runs.push({ scenario: scenario.id, arm, repetition });
    }
  }
  return shuffled(runs, options.seed ?? manifest.seed);
}

function lifecycleArgs(arm, pluginData) {
  if (arm.injection !== 'user-prompt-submit-hook') return [];
  const pluginRoot = projectRoot;
  const command = [
    'env',
    `PLUGIN_ROOT=${JSON.stringify(pluginRoot)}`,
    `CLAUDE_PLUGIN_ROOT=${JSON.stringify(pluginRoot)}`,
    `PLUGIN_DATA=${JSON.stringify(pluginData)}`,
    'node',
    JSON.stringify(path.join(pluginRoot, 'hooks', 'inject.js')),
    'UserPromptSubmit',
  ].join(' ');
  const hookConfig = `[{ hooks = [{ type = "command", command = ${JSON.stringify(command)}, timeout = 5 }] }]`;
  return ['--config', `hooks.UserPromptSubmit=${hookConfig}`];
}

function prepareWorkspace(fixtureRoot, config) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-seeker-benchmark-'));
  const workspace = path.join(tempRoot, 'workspace');
  fs.cpSync(path.join(fixtureRoot, 'workspace'), workspace, { recursive: true });

  if (config.generatedDistractors) {
    const directory = path.join(workspace, config.generatedDistractors.directory);
    fs.mkdirSync(directory, { recursive: true });
    for (let index = 1; index <= config.generatedDistractors.count; index += 1) {
      const prefix = config.generatedDistractors.filenamePrefix || 'historical-note-';
      const name = `${prefix}${String(index).padStart(3, '0')}.txt`;
      const template = config.generatedDistractors.contentTemplate || 'Archived unrelated note {index}.\n';
      fs.writeFileSync(path.join(directory, name), template.replaceAll('{index}', String(index)));
    }
  }
  return { tempRoot, workspace };
}

function isoDirectoryName() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function threadIdFromTrace(stdout) {
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'thread.started' && event.thread_id) return event.thread_id;
    } catch (_error) {
      // The scorer records malformed trace lines; session discovery only needs valid JSONL events.
    }
  }
  return null;
}

function executePlan(manifest, plan, options) {
  if (process.env.TRUTH_SEEKER_BENCHMARK_APPROVED !== '1') {
    throw new Error('Execution requires TRUTH_SEEKER_BENCHMARK_APPROVED=1');
  }
  const model = options.model || manifest.defaultModel;
  if (!model) throw new Error('Model must be set in the manifest or with --model');
  const reasoning = options.reasoning || manifest.defaultReasoningEffort;
  if (!reasoning) throw new Error('Reasoning effort must be set in the manifest or with --reasoning');

  const resultRoot = path.join(benchmarkRoot, 'results', `run-${isoDirectoryName()}`);
  fs.mkdirSync(resultRoot, { recursive: true });
  const schema = path.join(benchmarkRoot, 'schemas', 'result.schema.json');

  for (let index = 0; index < plan.length; index += 1) {
    const item = plan[index];
    const manifestEntry = manifest.scenarios.find(entry => entry.id === item.scenario);
    const { fixtureRoot, config } = loadScenario(manifestEntry);
    const { tempRoot, workspace } = prepareWorkspace(fixtureRoot, config);
    const pluginData = path.join(tempRoot, 'plugin-data');
    const runName = `${String(index + 1).padStart(3, '0')}-${item.scenario}-${item.arm}-r${item.repetition}`;
    const runRoot = path.join(resultRoot, runName);
    fs.mkdirSync(runRoot, { recursive: true });

    const basePrompt = fs.readFileSync(path.join(fixtureRoot, config.promptFile), 'utf8').trim();
    const armConfig = manifest.arms[item.arm];
    const prompt = basePrompt;
    const finalFile = path.join(runRoot, 'final.json');
    const scopeApprovalRequired = item.arm === 'focused' && config.scopeApproval === true;
    const firstFinalFile = scopeApprovalRequired
      ? path.join(runRoot, 'scope-final.json')
      : finalFile;
    const args = [
      'exec', '--json',
      ...(scopeApprovalRequired ? [] : ['--ephemeral']),
      '--ignore-user-config', '--ignore-rules',
      '--dangerously-bypass-hook-trust',
      '--sandbox', 'workspace-write', '--skip-git-repo-check',
      '--output-schema', schema, '--output-last-message', firstFinalFile,
      '--model', model, '--config', `model_reasoning_effort=${JSON.stringify(reasoning)}`,
      ...lifecycleArgs(armConfig, pluginData),
      '--cd', workspace, '-',
    ];
    const startedAt = new Date();
    const started = process.hrtime.bigint();
    const result = spawnSync('codex', args, {
      cwd: workspace,
      encoding: 'utf8',
      input: prompt,
      maxBuffer: 64 * 1024 * 1024,
    });
    let finalResult = result;
    let traceOutput = result.stdout || '';
    let stderrOutput = result.stderr || '';
    let scopeThreadId = null;
    let approvalPrompt = null;

    if (scopeApprovalRequired) {
      fs.writeFileSync(path.join(runRoot, 'scope-trace.jsonl'), result.stdout || '');
      fs.writeFileSync(path.join(runRoot, 'scope-stderr.log'), result.stderr || '');
      scopeThreadId = threadIdFromTrace(result.stdout);
      approvalPrompt = config.scopeApprovalPrompt ||
        'Approved. Proceed exactly within the proposed scope. Ask again before expanding it.';

      if (result.status === 0 && scopeThreadId) {
        const resumeArgs = [
          'exec', 'resume', '--json', '--ignore-user-config', '--ignore-rules',
          '--dangerously-bypass-hook-trust', '--skip-git-repo-check',
          '--output-schema', schema, '--output-last-message', finalFile,
          '--model', model, '--config', `model_reasoning_effort=${JSON.stringify(reasoning)}`,
          ...lifecycleArgs(armConfig, pluginData),
          scopeThreadId, '-',
        ];
        finalResult = spawnSync('codex', resumeArgs, {
          cwd: workspace,
          encoding: 'utf8',
          input: approvalPrompt,
          maxBuffer: 64 * 1024 * 1024,
        });
        traceOutput += finalResult.stdout || '';
        stderrOutput += finalResult.stderr || '';
      }
    }
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;

    fs.writeFileSync(path.join(runRoot, 'trace.jsonl'), traceOutput);
    fs.writeFileSync(path.join(runRoot, 'stderr.log'), stderrOutput);
    fs.cpSync(workspace, path.join(runRoot, 'workspace'), { recursive: true });
    fs.writeFileSync(path.join(runRoot, 'metadata.json'), JSON.stringify({
      ...item,
      model,
      reasoningEffort: reasoning,
      startedAt: startedAt.toISOString(),
      durationMs,
      exitCode: finalResult.status,
      signal: finalResult.signal,
      injection: armConfig.injection,
      promptSha256: createHash('sha256').update(prompt).digest('hex'),
      scopeApprovalRequired,
      scopeApprovalGranted: scopeApprovalRequired && Boolean(scopeThreadId) && result.status === 0,
      scopeProposalExitCode: scopeApprovalRequired ? result.status : null,
      scopeThreadId,
      approvalPromptSha256: approvalPrompt
        ? createHash('sha256').update(approvalPrompt).digest('hex')
        : null,
    }, null, 2) + '\n');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(resultRoot, 'plan.json'), JSON.stringify({
    model,
    reasoningEffort: reasoning,
    runs: plan,
  }, null, 2) + '\n');
  process.stdout.write(`${resultRoot}\n`);
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const manifest = loadManifest();
  const plan = buildPlan(manifest, options);
  if (!options.execute) {
    process.stdout.write(JSON.stringify({
      execute: false,
      seed: options.seed ?? manifest.seed,
      runCount: plan.length,
      model: options.model || manifest.defaultModel,
      reasoningEffort: options.reasoning || manifest.defaultReasoningEffort,
      runs: plan,
    }, null, 2) + '\n');
  } else {
    executePlan(manifest, plan, options);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
