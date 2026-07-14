#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { benchmarkRoot, loadManifest, loadScenario } from './lib.mjs';

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
    if (!['none', 'user-prompt-submit-hook'].includes(config.injection)) {
      errors.push(`arm ${arm}: unsupported injection ${config.injection}`);
    }
  }

  if (manifest.arms?.baseline?.injection !== 'none') {
    errors.push('baseline arm must not inject Truth Seeker');
  }
  if (manifest.arms?.focused?.injection !== 'user-prompt-submit-hook') {
    errors.push('focused arm must use the UserPromptSubmit lifecycle hook');
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
      for (const key of ['requiredAnswerPatterns', 'forbiddenCommandPatterns', 'verificationCommandPatterns', 'verificationEvidencePatterns', 'evidenceOutputPatterns']) {
        for (const pattern of config.oracle[key] || []) new RegExp(pattern, 'i');
      }
      for (const file of config.oracle.forbiddenFilePaths || []) {
        if (typeof file !== 'string' || !file || path.isAbsolute(file) || file.startsWith('..')) {
          errors.push(`${entry.id}: invalid forbidden file path ${file}`);
        }
      }
      if (config.oracle.distractorOutputPattern) new RegExp(config.oracle.distractorOutputPattern, 'i');
      for (const key of ['efficientCommandBudget', 'explorationTokenBudget']) {
        const value = config.oracle[key];
        if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
          errors.push(`${entry.id}: ${key} must be a positive number`);
        }
      }
    } catch (error) {
      errors.push(`${entry.id}: ${error.message}`);
    }
  }
}

if (manifest && (!manifest.defaultModel || typeof manifest.defaultModel !== 'string')) {
  errors.push('manifest.json: defaultModel must be a non-empty string');
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
