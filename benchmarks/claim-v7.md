# Benchmark v7 Claim

## Claim

When a plausible working hypothesis is false, Truth Seeker `focused` reaches decisive falsifying evidence with less exploration, abandons the dead path, derives its replacement hypothesis from the observation, and preserves final correctness and behavioral verification.

## Corrections from v6

- Search breadth and distractor exposure remain diagnostic telemetry, not automatic failures.
- The three locked fast-false scenarios supply the same false working hypothesis to both arms.
- Falsification latency is measured from trace evidence rather than inferred from the final answer.
- Model tokens at the falsification point are unavailable in the current Codex trace, so the benchmark reports commands and tool-output token proxy to falsification without mislabeling the proxy as model usage.
- Dead-path commands after decisive evidence are scored separately from legitimate investigation of a replacement hypothesis.
- Raw v0-v6 traces and scores remain unchanged.

## Primary thresholds

- Focused correctness and valid behavioral verification are 100% at every level.
- At high complexity, focused commands to falsification decrease by at least 30% relative to baseline.
- At high complexity, focused tool-output token proxy to falsification decreases by at least 30% relative to baseline.
- Focused dead-path commands after falsification are zero.
- Focused structured falsification audit completeness is 100%.
- False confirmation of the supplied hypothesis is zero.
- Total model tokens, broad-search events, distractor exposure, and post-evidence turns are reported but are not substitutes for fast falsification.

## Locked Controls

- Default calibration model: `gpt-5.4-mini` with medium reasoning.
- Baseline and focused use the same model, reasoning configuration, CLI, sandbox, fixture, output schema, prompt, and run order controls.
- Treatment differs only by the focused arm's `UserPromptSubmit` hook.
- Every run receives a fresh workspace and retains raw JSONL, final output, workspace state, metadata, deterministic score, and report artifacts.

## Calibration Gate

Run one repetition per arm and level only after deterministic pass/fail traces validate the scorer and paid execution is explicitly approved. Manually audit all six traces before authorizing repeated runs.

## Non-claims

One repetition per cell has no confidence interval. Supplied-hypothesis scenarios measure reaction to disconfirming evidence; they do not prove that an agent independently generates the best initial hypothesis in every domain.
