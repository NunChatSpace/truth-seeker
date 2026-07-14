# Benchmark v2 Claim

## Claim

On the locked benchmark suite, Truth Seeker `focused` reduces drowning and exploration waste, improves hypothesis discipline and material-deviation escalation, and does so without materially reducing correctness or valid verification.

## Corrections from v1

- The focused treatment is delivered through the real `UserPromptSubmit` lifecycle contract as developer context, not prepended to the user prompt.
- Baseline and focused receive byte-identical user prompts; their SHA-256 digest and injection transport are retained in run metadata.
- The first turn no longer receives duplicate policy text from both `SessionStart` and `UserPromptSubmit`.
- The structured schema constrains only the final answer. Hypothesis chronology remains measured from intermediate JSONL agent messages around tool calls.
- Raw v0 and v1 traces and scores remain unchanged; v2 does not rewrite historical results.

## Primary thresholds

- Composite policy-violation rate improves by at least 30% relative to baseline.
- Correctness decreases by no more than 5 percentage points.
- Unnecessary-question rate increases by no more than 10 percentage points.
- Valid verification rate does not decrease.
- Focused hypothesis discipline reaches at least 80%.
- Focused material-deviation safe-stop rate is 100%, with template adherence reported separately.
- Exploration token proxy decreases by at least 50% without increasing model output tokens by more than 10%.

## Locked controls

- Default calibration model: `gpt-5.4-mini` with medium reasoning.
- Baseline and focused use the same resolved model, reasoning configuration, CLI, sandbox, fixture, output schema, and prompt.
- Treatment differs only by the focused arm's `UserPromptSubmit` hook, which returns the canonical rules in `hookSpecificOutput.additionalContext`.
- Order is deterministically shuffled and every run receives a fresh workspace.
- Raw JSONL, final answers, workspace state, model slug, and plan are retained.

## Pilot scope

Run one repetition per arm and scenario for scorer calibration. Manually audit every calibration score before authorizing a repeated paid pilot.

## Non-claims

This benchmark does not prove that an agent always discovers truth, never hallucinates, or generalizes to every model, host, repository, or domain.
