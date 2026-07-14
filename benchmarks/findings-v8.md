# v8 Calibration Findings

## Facts

- Commit `3bd3511` added fast-false rules, a required falsification audit, required post-falsification probe audits, objective classification, and three controlled scenarios in one change set.
- On the one-repetition complex calibration, focused used 4 commands to falsification versus baseline 5, a 20.0% reduction that missed the locked 30% threshold.
- Focused tool-output proxy to falsification was 6,125 versus baseline 1,499, an increase of 308.6%.
- Focused total model tokens were 98,320 versus baseline 81,043, an increase of 21.3%.
- Both arms retained 100% correctness, verification, and structured falsification audit completeness.
- The v8 scorer classified five focused complex commands as unjustified. Manual trace audit found four citation-oriented rereads using `nl -ba` after the relevant evidence was already available.
- One source-reference search was a false positive from an objective model that was too narrow; it could eliminate a residual runtime-cache alternative.
- The calibration used one repetition per cell and therefore has no confidence interval.

## Probable Contributors

- The required output schema expanded from the common hypothesis/result audit to include falsification details, replacement basis, and a five-field record for every post-falsification probe. This may have encouraged evidence collection for reporting rather than decision making.
- The focused rule added explicit per-probe recording obligations. The trace's citation rereads are consistent with that burden, but the calibration does not isolate it as the sole cause.
- The rule explicitly allowed broad search when judged discriminating. In the complex run, focused accumulated substantially more tool output before falsification than baseline.
- Natural model variance was large across one-repetition v7 and v8 calibrations, so the exact contribution of policy, schema, and sampling noise is unknown.

## Unknowns

- The calibration does not prove how much of the regression came from the prompt rules versus the output schema.
- It does not establish whether the same result would persist across repeated runs or another model.
- It does not prove that every command classified as unmapped lacked decision value in an open-ended task.

## Decision

- Roll back only the treatment burden: remove required post-falsification probe records and replacement-basis output, and restore the compact focused transition rule.
- Retain raw v7/v8 artifacts, fast-false fixtures, trace-based falsification metrics, and objective classification as offline telemetry.
- Do not rewrite historical scores or claim that v8 proved a general regression.
