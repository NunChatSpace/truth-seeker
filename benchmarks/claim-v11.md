# Claim v11: conditional scope control

## Hypothesis

Stating a bounded scope before exploration, while asking the user only for an unbounded scope or material expansion, will preserve user control without the two-turn overhead observed in v10.

## Treatment

- A bounded task emits `SCOPE` and proceeds with the cheapest discriminating probe.
- An unbounded task emits `SCOPE PROPOSAL`, asks for approval, and stops before investigation tools.
- Material scope expansion requires new evidence, a revised proposal, and new approval.
- Protocol records must remain in assistant output or structured host fields, never shell commands.

The fast-false ladder is intentionally bounded and single-turn. The `scope-ambiguous` control is opt-in and exercises the two-turn runner without increasing the default paid plan.

## Primary gates

- Correctness, verification, and falsification audit remain 100%.
- Required scope-approval scenarios pass chronology at 100%.
- At high complexity, commands to falsification and output proxy to falsification each improve by at least 30% against the contemporaneous baseline.

## Telemetry

- Total model tokens across all turns.
- Broad-search events and unique distractor paths.
- Necessary and unjustified post-falsification commands.
- Retries without new evidence.

One repetition per cell is directional calibration only. A passing calibration must be confirmed with repeated paired runs before making a general claim.
