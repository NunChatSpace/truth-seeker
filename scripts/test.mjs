#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function testFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(file);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [file] : [];
  });
}

const files = testFiles(path.join(root, 'tests')).sort();
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
