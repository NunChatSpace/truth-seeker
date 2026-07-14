# Claim v12: scope information gain

## Hypothesis

One scope question is worthwhile when the user's answer supplies a boundary that materially reduces high-fanout exploration. Generic approval without new information should not receive the same credit.

## Arms

- `baseline`: no Truth Seeker injection and no extra user turn.
- `approval-control`: Truth Seeker asks, then receives generic approval with no new scope information.
- `informed-scope`: Truth Seeker asks, then learns that the observation came from the runtime API and receives explicit path and exclusion boundaries.

Every arm receives the same initial prompt and workspace. The informed answer reveals scope, not the root cause.

## Primary gates

- Informed scope asks exactly once and performs no investigation before the answer.
- Correctness, verification, and falsification audit remain 100%.
- Against baseline, informed scope reduces raw total tokens by at least 20%.
- Against baseline, informed scope reduces commands and tool-output proxy to falsification by at least 30%.

## Accounting

Reports separate raw input, cached input, output, raw total, and uncached-equivalent tokens. Raw total includes every turn. Uncached-equivalent is diagnostic only and does not replace raw-token gates.

The approval-control arm isolates ceremony overhead from actual information gain. One repetition is calibration evidence only.
