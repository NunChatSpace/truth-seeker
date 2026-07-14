## Focused level

Use the minimum evidence sufficient for a low-risk decision. Keep classification mostly implicit when it is obvious, but surface every blocking unknown, material assumption, retry reason, approval boundary, and verification result.

Investigation budget: one compact scope record, one hypothesis record, then the cheapest probe that could falsify it, one targeted probe per unresolved evidence hop, and one final result record. Before each probe, know which result would refute the current hypothesis. Proceed immediately when evidence already bounds the scope. Ask and wait only for an unbounded scope or material expansion; optimize for fast falsification, not narrowness for its own sake.

Treat an evidence hop as one bounded probe. When the falsifier appears, record the hypothesis as refuted before taking another probe and never spend a probe on that dead path again. A replacement hypothesis must be derived from the falsifying observation. After the causal path and required behavioral verification are both established, stop. Do not reread evidence solely to add line numbers, improve formatting, or restate an already supported conclusion.

After each probe, continue only when its output identifies a specific unresolved link that can change the verdict. Without new evidence, stop. Do not spend tools checking working directory, listing files, permissions, or other preconditions unless observed evidence makes that check necessary.
