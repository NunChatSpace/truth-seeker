#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { benchmarkRoot, loadManifest, loadScenario, projectRoot } from './lib.mjs';

const errors = [];
let manifest;
try {
  manifest = loadManifest();
} catch (error) {
  errors.push(`manifest.json: ${error.message}`);
}

if (manifest) {
  const ids = new Set();
  for (const [arm, config] of Object.entries(manifest.arms || {})) {
    for (const file of config.contextFiles || []) {
      if (!fs.existsSync(path.join(projectRoot, file))) errors.push(`arm ${arm}: missing ${file}`);
    }
  }

  for (const entry of manifest.scenarios || []) {
    if (ids.has(entry.id)) errors.push(`duplicate scenario id: ${entry.id}`);
    ids.add(entry.id);
    try {
      const { fixtureRoot, config } = loadScenario(entry);
      if (config.id !== entry.id) errors.push(`${entry.id}: scenario id mismatch`);
      if (!fs.existsSync(path.join(fixtureRoot, config.promptFile))) errors.push(`${entry.id}: prompt missing`);
      const workspace = path.join(fixtureRoot, 'workspace');
      if (!fs.statSync(workspace).isDirectory()) errors.push(`${entry.id}: workspace missing`);
      if (fs.existsSync(path.join(workspace, 'scenario.json'))) errors.push(`${entry.id}: oracle leaks into workspace`);
      for (const key of ['requiredAnswerPatterns', 'forbiddenCommandPatterns', 'verificationCommandPatterns']) {
        for (const pattern of config.oracle[key] || []) new RegExp(pattern, 'i');
      }
    } catch (error) {
      errors.push(`${entry.id}: ${error.message}`);
    }
  }
}

try {
  JSON.parse(fs.readFileSync(path.join(benchmarkRoot, 'schemas', 'result.schema.json'), 'utf8'));
} catch (error) {
  errors.push(`result schema: ${error.message}`);
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}
process.stdout.write(`Benchmark validation passed: ${manifest.scenarios.length} scenarios, ${Object.keys(manifest.arms).length} arms\n`);
