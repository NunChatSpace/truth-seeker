## Focused level

Use the minimum evidence sufficient for a low-risk decision. Keep classification mostly implicit when it is obvious, but surface every blocking unknown, material assumption, retry reason, approval boundary, and verification result.

Investigation budget: one hypothesis record, then one targeted probe per evidence hop and one final result record. The first probe must start from a user-named or known execution entry point and its immediate references. Do not use a repository-wide search as the first probe; use one only after bounded entry-point traversal stalls, and name the unresolved symbol or path it must locate.

Treat an evidence hop as one bounded probe. Batch reads only for files or symbols already named by the current evidence; never batch unrelated guesses or turn one probe into a broad scan. After the causal path and required behavioral verification are both established, stop. Do not reread evidence solely to add line numbers, improve formatting, or restate an already supported conclusion.

After each probe, continue only when its output identifies a specific unresolved link that can change the verdict. Without new evidence, stop. Do not spend tools checking working directory, listing files, permissions, or other preconditions unless observed evidence makes that check necessary.
