# Benchmark v8 Claim

## Claim

Truth Seeker `focused` falsifies a false working hypothesis efficiently, then spends additional probes only on decision-relevant replacement evidence, residual alternatives, or behavioral verification. It avoids repeated or unmapped continuation without reducing correctness or verification.

## Corrections from v7

- Post-falsification commands are not failures by default.
- Controlled scenario objectives classify each post-falsification command as replacement evidence, residual-alternative elimination, verification, or unjustified continuation.
- A mixed command may satisfy multiple unused objectives and remains one justified probe.
- Reusing an already satisfied objective, repeating the same command and output, or issuing an unmapped probe is unjustified.
- Structured probe audits record the unknown, test, observation, and decision impact; trace commands remain the behavioral evidence.
- Raw v0-v7 traces and scores remain unchanged.

## Primary Thresholds

- Focused correctness and valid behavioral verification are 100% at every level.
- At high complexity, focused commands to falsification and tool-output proxy to falsification each decrease by at least 30% relative to baseline.
- Focused falsification audit and post-falsification probe audit completeness are 100%.
- Focused unjustified continuation and retry without new evidence are zero.
- Necessary post-falsification probes are reported and are not minimized to zero.
- Total model tokens, broad-search events, distractor exposure, and total post-falsification probes remain diagnostic telemetry.

## Locked Controls

- Default calibration model: `gpt-5.4-mini` with medium reasoning.
- Baseline and focused share the model, reasoning configuration, CLI, sandbox, fixture, output schema, prompt, and run order controls.
- Treatment differs only by focused `UserPromptSubmit` context.
- Each run receives a fresh workspace and retains raw JSONL, final output, workspace state, metadata, deterministic score, and reports.

## Calibration Gate

Run one repetition per arm and level only after deterministic traces prove that a necessary alternative check passes, a mixed command is classified per objective, and repeated or unmapped continuation fails. Paid execution requires explicit approval.

## Non-claims

Controlled objectives do not prove decision relevance in every open-ended domain. One repetition per cell has no confidence interval, and tool-output token proxy is not model token usage.
