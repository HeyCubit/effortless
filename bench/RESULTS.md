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

30 self-contained prompts. Each is answered on Opus (the baseline) and on the model and effort a router would pick: Haiku low for easy, Sonnet medium for normal, Opus high for hard. A blind grader (Opus, high effort, answers in random order) says which is better and whether the worse one would still serve the user. Run 2026-10-09, one run each. Two baselines, because "better than Opus" depends on which Opus.

**Against Opus at high effort**

| Tier | Routed better | Tie | Baseline better | Routed good enough | Baseline cost | Routed cost | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy (12) | 0 | 1 | 11 | 83% | $0.126 | $0.028 | 78% |
| normal (12) | 0 | 4 | 8 | 100% | $0.329 | $0.113 | 66% |
| hard (6, same model) | 0 | 6 | 0 | 100% | $1.164 | $1.164 | 0% |
| all (30) | 0 | 11 | 19 | 93% | $1.620 | $1.306 | 19% |

**Against Opus at medium effort** (what most people run)

| Tier | Routed better | Tie | Baseline better | Routed good enough | Baseline cost | Routed cost | Saved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy (12) | 0 | 5 | 7 | 75% | $0.124 | $0.029 | 77% |
| normal (12) | 1 | 4 | 7 | 100% | $0.284 | $0.115 | 60% |
| hard (6, routed to Opus high) | 2 | 3 | 1 | 100% | $0.714 | $0.903 | -26% |
| all (30) | 3 | 12 | 15 | 90% | $1.121 | $1.046 | 7% |

Median time per answer against Opus medium: 7.4 s baseline, 6.4 s routed (easy 4.1 s vs 4.4 s, normal 9.4 s vs 6.5 s). Routing is not slower, and not meaningfully faster on easy prompts.

What it says:
- The cheaper model is rarely better and often slightly worse: a missing edge case, a less exact explanation. The grader is strict and counts those as losses.
- **Normal prompts on Sonnet medium held up in every case (12 of 12 good enough) at 60 to 66% less cost.** That is the part that works.
- **Easy prompts on Haiku are the weak spot.** Good enough in 9 to 10 of 12. The misses were a shell one-liner that breaks in subfolders, a regex whose own explanation was wrong, an unidiomatic translation, an async explanation that overclaimed.
- Hard prompts go to Opus at high effort. Against Opus medium that costs 26% more and gave 2 better, 3 tied, 1 worse. It buys quality, not savings.
- Net against Opus medium, across this mix: 7% cheaper, 90% good enough. Against Opus high: 19% cheaper. The saving depends on how many of your prompts are easy or normal.

Details per case: `bench/results/quality-202610091528.md` (vs high) and `quality-202610091911-vs-opus-medium.md`, with the .json beside each.

## Limits

- **Prompts start with no chat history.** In a real chat the context is already in a prompt cache. Moving a prompt to another model means writing that context into the other model's cache, and from a warm Opus chat that costs more than staying put. So the savings above are what you get with a small or cold context. In a long warm chat the mod mostly stays on your model, and saves less. This benchmark does not measure that.
- Routing here follows the label in the case file, not the live judge. How often the live judge agrees with those labels is benchmark 1.
- One run per baseline, one grader, same model family as the baseline, so it may favour Opus-style answers. Run it twice before quoting a close number.
- 30 prompts, none of them long agentic sessions with tools.
- Cost is the CLI's list-price dollars for each answer, not your plan's usage.
