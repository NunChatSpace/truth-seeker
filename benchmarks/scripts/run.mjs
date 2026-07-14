#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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
  --model MODEL               Required with --execute
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

function treatmentContext(manifest, arm) {
  return manifest.arms[arm].contextFiles
    .map(file => fs.readFileSync(path.join(projectRoot, file), 'utf8').trim())
    .join('\n\n');
}

function prepareWorkspace(fixtureRoot, config) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-seeker-benchmark-'));
  const workspace = path.join(tempRoot, 'workspace');
  fs.cpSync(path.join(fixtureRoot, 'workspace'), workspace, { recursive: true });

  if (config.generatedDistractors) {
    const directory = path.join(workspace, config.generatedDistractors.directory);
    fs.mkdirSync(directory, { recursive: true });
    for (let index = 1; index <= config.generatedDistractors.count; index += 1) {
      const name = `historical-note-${String(index).padStart(3, '0')}.txt`;
      fs.writeFileSync(path.join(directory, name), `Archived unrelated note ${index}.\n`);
    }
  }
  return { tempRoot, workspace };
}

function isoDirectoryName() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function executePlan(manifest, plan, options) {
  if (process.env.TRUTH_SEEKER_BENCHMARK_APPROVED !== '1') {
    throw new Error('Execution requires TRUTH_SEEKER_BENCHMARK_APPROVED=1');
  }
  if (!options.model) throw new Error('--model is required with --execute');
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
    const runName = `${String(index + 1).padStart(3, '0')}-${item.scenario}-${item.arm}-r${item.repetition}`;
    const runRoot = path.join(resultRoot, runName);
    fs.mkdirSync(runRoot, { recursive: true });

    const basePrompt = fs.readFileSync(path.join(fixtureRoot, config.promptFile), 'utf8').trim();
    const context = treatmentContext(manifest, item.arm);
    const prompt = context
      ? `Additional operating policy:\n\n${context}\n\nTask:\n${basePrompt}`
      : basePrompt;
    const finalFile = path.join(runRoot, 'final.json');
    const args = [
      'exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules',
      '--sandbox', 'workspace-write', '--skip-git-repo-check',
      '--output-schema', schema, '--output-last-message', finalFile,
      '--model', options.model, '--config', `model_reasoning_effort=${JSON.stringify(reasoning)}`,
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
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;

    fs.writeFileSync(path.join(runRoot, 'trace.jsonl'), result.stdout || '');
    fs.writeFileSync(path.join(runRoot, 'stderr.log'), result.stderr || '');
    fs.cpSync(workspace, path.join(runRoot, 'workspace'), { recursive: true });
    fs.writeFileSync(path.join(runRoot, 'metadata.json'), JSON.stringify({
      ...item,
      model: options.model,
      reasoningEffort: reasoning,
      startedAt: startedAt.toISOString(),
      durationMs,
      exitCode: result.status,
      signal: result.signal,
    }, null, 2) + '\n');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  fs.writeFileSync(path.join(resultRoot, 'plan.json'), JSON.stringify({
    model: options.model,
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
