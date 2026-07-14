# Claim v10: approved scope before exploration

## Hypothesis

Requiring a compact scope proposal and user approval before exploration will prevent high-output repository sweeps while preserving correctness, verification, and fast falsification.

## Treatment

Focused runs use two turns for scenarios with `scopeApproval: true`:

1. The agent proposes `Search`, `Exclude`, `Goal`, and `Expand only if`, then stops without investigation tools.
2. The benchmark user approves the proposed scope and the agent continues in the same Codex session.

Baseline runs remain single-turn. Focused token and command metrics include both turns. The proposal is a pre-search control, not a final-answer audit field.

## Primary gates

- Scope approval chronology passes for every focused run.
- Correctness, verification, and falsification audit remain 100%.
- At high complexity, commands to falsification and output proxy to falsification each improve by at least 30% against the contemporaneous baseline.

## Telemetry

- Total model tokens across both turns.
- Broad-search events and unique distractor paths.
- Necessary and unjustified post-falsification commands.
- Retries without new evidence.

One repetition per cell is directional calibration only. A passing calibration must be confirmed with repeated paired runs before making a general claim.
