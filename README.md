# Truth Seeker

Truth Seeker is an always-on Codex and Claude plugin for evidence-first analysis, root-cause investigation, implementation, and verification.

Its operating rule is simple: **seek the truth without drowning in the search**.

## Behavior

- Separates facts, assumptions, interpretations, and unknowns.
- Asks before crossing a blocking unknown.
- Makes every investigation target a named unknown or competing hypothesis.
- Stops repeated attempts that have no new evidence.
- Stops after two failed solution approaches and asks before a third.
- Requires approval for costly, destructive, security-sensitive, production, or irreversible actions.
- Requires verification tied to success criteria before claiming success.
- Reuses existing and native capabilities before adding code or dependencies.

Truth Seeker has no off mode.

## Levels

- `focused` is the default and uses the minimum sufficient evidence.
- `deep` makes hypotheses and disconfirming evidence explicit.
- `forensic` maintains a reproducible evidence chain for high-stakes work.

In Codex, change the current session level with `@Truth-Seeker focused`, `@Truth-Seeker deep`, or `@Truth-Seeker forensic`. In Claude Code, use the corresponding `/truth-seeker` command. Set `TRUTH_SEEKER_DEFAULT_MODE` to one of those values to change the startup default.

## Installation

Add the GitHub repository as a marketplace, then install the plugin.

Claude Code:

```text
/plugin marketplace add NunChatSpace/truth-seeker
/plugin install truth-seeker@truth-seeker
```

Codex:

```bash
codex plugin marketplace add NunChatSpace/truth-seeker
codex plugin add truth-seeker@truth-seeker
```

Review and trust the lifecycle hooks when prompted, then start a new thread. Node.js must be available on the non-interactive hook PATH.

For local development, replace `NunChatSpace/truth-seeker` with the absolute path to this checkout.

## Development

Node.js 18 or newer is required for lifecycle hooks and tests.

```bash
npm test
```

The canonical policy is in `rules/core.md`. Lifecycle hooks inject it on session start, every user prompt, and every subagent start.

Behavioral evaluation lives in [`benchmarks/`](benchmarks/README.md). The benchmark runner is dry-run-first and requires an explicit approval environment variable before it can spend model tokens.

Reports keep correctness and safety as hard gates, then compare baseline and Truth Seeker across drowning resistance, exploration efficiency, hypothesis discipline, and deviation escalation.

Benchmark v2 calibrates both arms on `gpt-5.4-mini` with medium reasoning before any repeated paid pilot. Both arms receive the same user prompt; focused receives Truth Seeker through the real `UserPromptSubmit` lifecycle context.

## Credits

The plugin packaging, lifecycle injection pattern, and minimal-solution ladder were inspired by [Ponytail](https://github.com/DietrichGebert/ponytail). Truth Seeker generalizes the discipline beyond code generation to evidence-based analysis and root-cause investigation.
