# Benchmark v4 Claim

## Claim

On the locked benchmark suite, Truth Seeker `focused` reduces drowning and exploration waste, improves hypothesis discipline and material-deviation escalation, and does so without materially reducing correctness or valid verification.

## Corrections from v3

- The common final-answer schema now includes nullable hypothesis, structured result, and nullable deviation records for both arms.
- Hypothesis audit completeness is the primary behavior dimension; pre-tool message chronology remains a separate diagnostic and is not reconstructed from the final answer.
- Structured deviation completeness replaces free-text template regex scoring, while safe stopping remains an independent gate.
- Shell commands and tool output still cannot satisfy either the final audit or the chronology diagnostic.
- Raw v0-v3 traces and scores remain unchanged; v4 does not rewrite historical results.

## Primary thresholds

- Composite policy-violation rate improves by at least 30% relative to baseline.
- Correctness decreases by no more than 5 percentage points.
- Unnecessary-question rate increases by no more than 10 percentage points.
- Valid verification rate does not decrease.
- Focused hypothesis audit completeness reaches at least 80%.
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
