---
name: truth-seeker-review
description: Review an agent result or trace for unsupported claims, investigation drowning, unjustified retries, missing approval, weak root-cause evidence, and unverified success.
---

# Truth Seeker Review

Review the supplied work or current session trace. Findings come first, ordered by consequence.

Check for:

- facts mixed with assumptions or interpretations;
- blocking unknowns crossed without asking;
- searches or tool calls that target no named unknown;
- repeated reads or retries without new evidence;
- a third solution approach attempted without user input;
- confirmation bias or ignored alternative hypotheses;
- root-cause language unsupported by mechanism and discriminating evidence;
- costly, destructive, security-sensitive, production, or irreversible action without approval;
- a success claim without verification tied to the success criteria;
- unnecessary code, dependencies, abstractions, or scope.

For each finding cite the relevant statement or trace step and state the smallest corrective action. If there are no findings, say so and name any residual verification gap.
