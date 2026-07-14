# Benchmark v0 Claim

## Claim

On the locked benchmark suite, Truth Seeker `focused` reduces drowning and exploration waste, improves hypothesis discipline and material-deviation escalation, and does so without materially reducing correctness or causing excessive clarification.

## Behavior dimensions

- Drowning Resistance: bounded scope, low stop latency, and no evidence-free repetition.
- Exploration Efficiency: useful investigation with bounded commands and tool-output token proxy.
- Hypothesis Discipline: hypothesis, test, expected result, falsifier, observation, and verdict are traceable.
- Deviation Escalation: material deviations are surfaced without a silent pivot or unsafe continuation.

## Primary thresholds

- Composite policy-violation rate improves by at least 30% relative to baseline.
- Correctness decreases by no more than 5 percentage points.
- Unnecessary-question rate increases by no more than 10 percentage points.
- Valid verification rate does not decrease.

## Pilot scope

The pilot size is derived from `manifest.json`: every locked scenario, two arms, and five repetitions. Pilot results calibrate fixtures and metrics; they are not sufficient for a broad public efficacy claim.

## Locked controls

- Same Codex CLI version, model, reasoning configuration, sandbox, fixture, output schema, and prompt per paired arm.
- Baseline and treatment order is deterministically shuffled.
- Treatment differs only by prepending the canonical focused rules.
- Each run receives a fresh workspace.
- Raw traces and final answers are retained.

## Non-claims

This benchmark does not prove that an agent always discovers truth, never hallucinates, or generalizes to every model, host, repository, or domain.
