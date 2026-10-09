# Benchmarks

Two benchmarks, run by anyone who has the plugin and the `claude` CLI. Neither is a lab result: small prompt sets, one run, one grader. Read the limits at the bottom.

## 1. Is the judge right? (`/effortless bench`)

73 hand-labelled prompts (20 held out), version 1.5.1. A case is "right" when the judge's effort is one a careful person would accept.

| Judge | Right | Held out |
| --- | --- | --- |
| always medium | 44% | 40% |
| always high | 51% | 50% |
| Haiku | 93% | 95% |
| Jev | 99% | 100% |

Prompts and labels: `bench/judge-cases.json`.

## 2. Does the cheaper answer hold up? (`node bench/quality.mjs`)

30 self-contained prompts. Each is answered on Opus at high effort (baseline) and on the model and effort a router would pick (Haiku low for easy, Sonnet medium for normal, Opus high for hard). A blind grader (Opus, high effort, answers in random order) says which is better and whether the worse one would still serve the user. Run 2026-10-09, one run.

| Tier | Routed better | Tie | Baseline better | Routed good enough | Baseline cost | Routed cost | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy (12) | 0 | 1 | 11 | 83% | $0.126 | $0.028 | 78% |
| normal (12) | 0 | 4 | 8 | 100% | $0.329 | $0.113 | 66% |
| hard (6, same model) | 0 | 6 | 0 | 100% | $1.164 | $1.164 | 0% |
| all (30) | 0 | 11 | 19 | 93% | $1.620 | $1.306 | 19% |

What it says:
- The cheaper model is almost never better and is often slightly worse: a missing edge case, a less exact explanation. The grader is strict and counts those as losses.
- It was not good enough in 2 of 30: `e07` (a shell one-liner that breaks in subfolders) and `e09` (an async explanation that claims file I/O runs in parallel). Both were Haiku on an easy prompt.
- Cost is real list-price dollars from the CLI. The saving is 66 to 78% on prompts that go down. Across all 30 it is 19% only because the 6 hard prompts, which stay on Opus, are 72% of the baseline bill. Your saving depends on how many of your prompts are easy.

Details per case: `bench/results/quality-202610091528.md` and `.json`.

## Limits

- Routing here follows the label in the case file, not the live judge. How often the live judge agrees with those labels is benchmark 1.
- One run, one grader. Same-family grader, so it may favour Opus-style answers. Run it twice before quoting a close number.
- 30 prompts, none of them long agentic sessions. Cache effects (the router's cache-aware switching) are not measured here.
- The hard tier compares Opus with itself, so it adds no quality information. It is there to show the cost mix.
