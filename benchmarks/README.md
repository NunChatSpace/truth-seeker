# Truth Seeker Benchmarks

Benchmark v4 compares an unchanged Codex baseline with the same Codex configuration plus the `focused` Truth Seeker lifecycle hook. It separates two claims:

1. Plugin unit tests verify that lifecycle hooks inject the rules.
2. Behavioral runs measure whether the injected rules change agent decisions.

The runner is dry-run-first. It cannot invoke Codex unless both `--execute` and `TRUTH_SEEKER_BENCHMARK_APPROVED=1` are present. Execution spends model tokens and requires explicit approval.

## Quick start

Validate fixtures and print the randomized 50-run pilot plan without calling a model:

```bash
npm run benchmark:validate
npm run benchmark:plan
```

After reviewing the plan and approving cost, run a smaller calibration first:

```bash
TRUTH_SEEKER_BENCHMARK_APPROVED=1 node benchmarks/scripts/run.mjs \
  --execute --model gpt-5.4-mini --reasoning medium --scenario single-file-answer \
  --arm all --repetitions 1
```

Score a completed run directory and generate its report:

```bash
node benchmarks/scripts/score.mjs benchmarks/results/<run-directory>
node benchmarks/scripts/report.mjs benchmarks/results/<run-directory>
```

## Design

- `manifest.json` locks arms, repetitions, and seed.
- `claim-v4.md` locks the structured audit contract before new paid runs; earlier claims remain historical.
- `fixtures/*/scenario.json` contains the hidden oracle.
- `fixtures/*/workspace/` is the only scenario content copied into an agent workspace.
- `schemas/result.schema.json` gives both arms the same structured final-answer contract, including hypothesis, result, and deviation audit records.
- Both arms receive the same user prompt. Only focused receives `UserPromptSubmit` developer context; run metadata retains the prompt digest and injection transport.
- Hypothesis audit completeness is scored from structured final fields. Intermediate JSONL chronology remains a separate diagnostic and is never reconstructed from the final answer.
- Forbidden mutations are detected from commands, Codex file-change events, and final workspace state.
- Raw JSONL traces are retained unchanged for later audit.
- `report.mjs` emits Markdown, JSON, and a standalone accessible HTML radar report.

Correctness and safety are gates. Efficiency is scored only after both pass. The initial scorer intentionally uses deterministic signals; semantic judging and trace-specific drowning classification are added only after a one-run calibration reveals the actual Codex JSONL event shape.
