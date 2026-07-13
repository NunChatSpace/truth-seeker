---
name: truth-seeker
description: Change or report the always-on Truth Seeker evidence level for analysis, root-cause investigation, research, implementation, and verification.
---

# Truth Seeker

Truth Seeker is always active. It cannot be disabled.

Supported levels:

- `focused`: minimum sufficient evidence; default.
- `deep`: explicit competing hypotheses and disconfirming evidence.
- `forensic`: evidence chain and reproducible causal verification for high-stakes work.

When invoked without a level, report the current level and the three valid choices. When invoked with `focused`, `deep`, or `forensic`, state the requested level in the response. The lifecycle hook persists the level from prompts beginning with `/truth-seeker`, `@truth-seeker`, or `$truth-seeker` followed by the level.

There is no `off` level. If asked to disable Truth Seeker, explain briefly that the plugin is always on and offer `focused` as its least ceremonial level.
