const fs = require('fs');
const os = require('os');
const path = require('path');

const MODES = new Set(['focused', 'deep', 'forensic']);
const DEFAULT_MODE = MODES.has(process.env.TRUTH_SEEKER_DEFAULT_MODE)
  ? process.env.TRUTH_SEEKER_DEFAULT_MODE
  : 'focused';

function stateDir() {
  if (process.env.PLUGIN_DATA) return process.env.PLUGIN_DATA;
  if (process.env.CLAUDE_CONFIG_DIR) return process.env.CLAUDE_CONFIG_DIR;
  return path.join(os.homedir(), '.config', 'truth-seeker');
}

function statePath() {
  return path.join(stateDir(), 'mode');
}

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return MODES.has(mode) ? mode : null;
}

function readMode() {
  try {
    return normalizeMode(fs.readFileSync(statePath(), 'utf8')) || DEFAULT_MODE;
  } catch (_error) {
    return DEFAULT_MODE;
  }
}

function writeMode(mode) {
  const normalized = normalizeMode(mode);
  if (!normalized) return false;
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(statePath(), normalized);
  return true;
}

function extractMode(prompt) {
  const match = String(prompt || '').trim().toLowerCase().match(
    /^(?:\/|@|\$)truth-seeker(?:\s+|:)(focused|deep|forensic)\b/,
  );
  return match ? match[1] : null;
}

function writeHookOutput(event, mode, context) {
  if (process.env.PLUGIN_DATA) {
    process.stdout.write(JSON.stringify({
      systemMessage: `TRUTH-SEEKER:${mode.toUpperCase()}`,
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: context,
      },
    }));
    return;
  }

  if (event === 'SubagentStart' || event === 'UserPromptSubmit') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: context,
      },
    }));
    return;
  }

  process.stdout.write(context);
}

module.exports = {
  DEFAULT_MODE,
  extractMode,
  normalizeMode,
  readMode,
  writeHookOutput,
  writeMode,
};
