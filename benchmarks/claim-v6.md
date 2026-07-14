# Benchmark v6 Claim

## Claim

On the locked complexity ladder, Truth Seeker `focused` follows a bounded entry-point-first investigation, reduces distractor exposure and exploration growth, and preserves correctness and valid behavioral verification.

## Corrections from v5

- The focused operating boundary now requires the first probe to start from a named or known execution entry point.
- Repository-wide search is permitted only after bounded traversal stalls and the unresolved symbol or path is named.
- Reads may be batched only when current evidence already names the files or symbols.
- Investigation stops after the causal path and required behavioral verification are established; evidence is not reread solely for citations or formatting.
- Broad-search events, unique distractor files, pre-evidence output, and post-evidence tool turns are reported separately from command count.
- Raw v0-v5 traces and scores remain unchanged; v6 does not rewrite historical results.

## Primary thresholds

- Correctness and valid verification remain 100% for focused at every complexity level.
- At high complexity, focused total tokens decrease by at least 20% and commands by at least 30% relative to baseline.
- At high complexity, focused performs zero repository-wide broad-search events.
- At high complexity, focused exposes zero generated distractor files.
- The focused-minus-baseline total-token growth slope is negative across the locked complexity ladder.
- Reasoning tokens, non-reasoning output tokens, pre-evidence exploration, post-evidence turns, and every failed gate are reported without being folded into correctness.

## Locked controls

- Default calibration model: `gpt-5.4-mini` with medium reasoning.
- Baseline and focused use the same resolved model, reasoning configuration, CLI, sandbox, fixture, output schema, prompt, and run order controls.
- Treatment differs only by the focused arm's `UserPromptSubmit` hook.
- The three complexity levels keep the user prompt and confirmed cause aligned while varying evidence hops, plausible causes, and generated distractors.
- Raw JSONL, final answers, workspace state, model slug, plan, deterministic scores, and complexity reports are retained.

## Calibration gate

Run one repetition per arm and complexity level only after deterministic validation passes and paid execution is explicitly approved. Manually audit every trace before authorizing a repeated pilot.

## Non-claims

This calibration cannot prove generalization to every task, model, host, repository, or domain. A one-repetition result has no confidence interval and cannot establish a public efficacy claim.
