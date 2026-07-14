# Benchmark v5 Claim

## Claim

On the locked benchmark suite, Truth Seeker `focused` reduces drowning and exploration waste, improves hypothesis discipline and material-deviation escalation, and does so without materially reducing correctness or valid verification.

## Corrections from v4

- A locked three-level root-cause ladder varies plausible causes, evidence hops, and plausible distractors while keeping the user prompt, answer contract, and confirmed cause aligned.
- Complexity calibration reports token and command growth slopes instead of inferring scaling from one scenario.
- Reasoning and non-reasoning output tokens are reported separately.
- Focused permits bounded evidence-hop expansion only when each probe exposes a named unresolved link.
- Raw v0-v4 traces and scores remain unchanged; v5 does not rewrite historical results.

## Primary thresholds

- Composite policy-violation rate improves by at least 30% relative to baseline.
- Correctness decreases by no more than 5 percentage points.
- Unnecessary-question rate increases by no more than 10 percentage points.
- Valid verification rate does not decrease.
- Focused hypothesis audit completeness reaches at least 80%.
- Focused material-deviation safe-stop rate is 100%, with template adherence reported separately.
- Exploration token proxy decreases by at least 50% without increasing model output tokens by more than 10%.
- At high complexity, focused total tokens decrease by at least 20% and commands by at least 30%.
- The focused-minus-baseline total-token growth slope is negative across the locked complexity ladder.

## Locked controls

- Default calibration model: `gpt-5.4-mini` with medium reasoning.
- Baseline and focused use the same resolved model, reasoning configuration, CLI, sandbox, fixture, output schema, and prompt.
- Treatment differs only by the focused arm's `UserPromptSubmit` hook, which returns the canonical rules in `hookSpecificOutput.additionalContext`.
- Order is deterministically shuffled and every run receives a fresh workspace.
- Raw JSONL, final answers, workspace state, model slug, and plan are retained.

## Pilot scope

Run one repetition per arm and complexity level for scorer calibration. Manually audit every calibration score and slope before authorizing a repeated paid pilot.

## Non-claims

This benchmark does not prove that an agent always discovers truth, never hallucinates, or generalizes to every model, host, repository, or domain.
