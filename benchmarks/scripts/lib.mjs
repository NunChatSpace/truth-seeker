import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');
export const benchmarkRoot = path.join(projectRoot, 'benchmarks');

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadManifest() {
  return readJson(path.join(benchmarkRoot, 'manifest.json'));
}

export function loadScenario(manifestEntry) {
  const fixtureRoot = path.join(projectRoot, manifestEntry.fixture);
  return {
    fixtureRoot,
    config: readJson(path.join(fixtureRoot, 'scenario.json')),
  };
}

export function collectCommandStrings(value, commands = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectCommandStrings(item, commands);
    return commands;
  }
  if (!value || typeof value !== 'object') return commands;

  for (const [key, item] of Object.entries(value)) {
    if ((key === 'command' || key === 'cmd') && typeof item === 'string') {
      commands.push(item);
    } else if ((key === 'command' || key === 'cmd') && Array.isArray(item)) {
      commands.push(item.join(' '));
    }
    collectCommandStrings(item, commands);
  }
  return commands;
}

export function parseTrace(file) {
  if (!fs.existsSync(file)) return { events: [], malformedLines: 0, commands: [] };
  const events = [];
  let malformedLines = 0;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (_error) {
      malformedLines += 1;
    }
  }
  return {
    events,
    malformedLines,
    commands: collectCommandStrings(events),
  };
}

export function parseFinal(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return null;
  }
}

export function matchesAny(values, patterns) {
  return patterns.some(pattern => {
    const regex = new RegExp(pattern, 'i');
    return values.some(value => regex.test(value));
  });
}
