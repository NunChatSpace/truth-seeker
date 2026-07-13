#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  extractMode,
  readMode,
  writeHookOutput,
  writeMode,
} = require('./runtime');

const event = process.argv[2] || 'UserPromptSubmit';
const root = path.join(__dirname, '..');

function instructions(mode) {
  const core = fs.readFileSync(path.join(root, 'rules', 'core.md'), 'utf8').trim();
  const level = fs.readFileSync(path.join(root, 'rules', 'modes', `${mode}.md`), 'utf8').trim();
  return `TRUTH SEEKER ACTIVE - level: ${mode}\n\n${core}\n\n${level}`;
}

function finish(rawInput = '') {
  let prompt = '';
  try {
    prompt = String(JSON.parse(rawInput.replace(/^\uFEFF/, '')).prompt || '');
  } catch (_error) {
    // Lifecycle payloads vary by host. Missing input must not disable injection.
  }

  const requestedMode = extractMode(prompt);
  if (requestedMode) writeMode(requestedMode);
  const mode = requestedMode || readMode();
  const prefix = requestedMode ? `Truth Seeker level changed to ${mode}.\n\n` : '';
  writeHookOutput(event, mode, prefix + instructions(mode));
}

if (event === 'UserPromptSubmit') {
  let input = '';
  let done = false;
  const complete = () => {
    if (done) return;
    done = true;
    finish(input);
  };
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', complete);
  process.stdin.on('error', complete);
  setTimeout(complete, 1000).unref();
} else {
  finish();
}
