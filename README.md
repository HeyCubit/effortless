# effortless

A Claude Code mod that picks the reasoning effort for every prompt, so easy questions run on low and hard jobs get high, without you touching the Effort control. It also shows how long the prompt cache stays warm, with one-click Compact when it goes cold.

```
⏻  Medium  42m
```

- **Medium**: the effort Auto picked for this prompt (purple). `Deciding…` while it judges, `Low → High` for a moment after a switch, `Off` when Auto is off.
- **⏻**: turns Auto on and off. Changing effort in the app yourself also turns Auto off: you always win.
- **42m**: time until the prompt cache goes cold. Grey, yellow from 20 minutes, red from 5. Then `Cold` with a **Compact** button: the next message would otherwise write the whole context to the cache again.

## Install

Type these two lines in Claude Code's chat box, no terminal needed:

```
/plugin marketplace add HeyCubit/effortless
/plugin install effortless@effortless
```

Restart Claude Code. A short setup opens above the prompt the first time: pick **Jev** (API key needed, about 4x faster than Haiku), **Haiku** (one click, no key, runs on your own Claude login) or **your own AI**, and it asks only for what that choice needs. Run `/effortless setup` to change it later.

From a terminal it is the same without the slashes: `claude plugin marketplace add HeyCubit/effortless`, then `claude plugin install effortless@effortless`.

## Pick your judge

Run `/plugin configure effortless@effortless` in Claude Code. Left unset, `auto` applies.

| Judge | What it needs | Speed |
|---|---|---|
| `auto` (default) | Jev when a TypeSafe key is set, Haiku otherwise | |
| `haiku` | nothing, uses your Claude login | about 1 s |
| `jev` | a [TypeSafe](https://typesafe.ai) key, in the settings or `TYPESAFE_API_KEY` (with `jev` picked, also `~/.config/jev/.env`) | about 0.25 s |
| `custom` | any OpenAI-compatible chat completions endpoint: URL, model and key | depends |

Custom examples:

| Provider | URL | Model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.1-8b-instant` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | any |
| Ollama (local) | `http://localhost:11434/v1/chat/completions` | `llama3.2`, no key |

Keys are stored as secret settings by Claude Code, never in a file of this repo. If a judge fails or takes longer than 3 seconds, effortless falls back to Haiku for that prompt and tells you why once per session (out of credits, key rejected, no answer).

Short follow-ups such as "go", "ok" or "yes" keep the effort already picked and ask no judge.

## Keys and trust

- The default judge needs **no key**: Haiku runs on your own Claude login.
- A key is only needed for `jev` or `custom`. Enter it with `/plugin configure`, never on the command line, so it stays out of your shell history. Claude Code keeps it in its secure storage, not in a file.
- A key is sent only to the judge you picked (TypeSafe, or the custom URL you entered), and to nothing else. Use a key with a spending limit if your provider offers one.
- Like any Claude Code plugin, this mod runs code on your machine. It is one file, [`hooks/register.tsx`](hooks/register.tsx): read it before you install if you do not know the author.

## Commands

| Command | Does |
|---|---|
| `/effortless setup` | pick the judge again |
| `/effortless auto` | Auto on or off |
| `/effortless stats` | what the prompts Auto steered cost this session, per effort, and what the judge took |
| `/effortless cold` | shows the cache as cold now, to try the Compact button |
| `/effortless bench` | runs the 72 labelled prompts (20 held out) in `bench/judge-cases.json` through each judge you have (Haiku, plus Jev and your own if set up) and saves a score table next to fixed medium/high |

## What it saves, honestly

Measured over 80k requests of real Claude Code use, about 76% of the cost is the context being read back from the cache on every tool call, 16% cache writes and only 8% output. Effort mostly changes how many tool calls a prompt makes.

- Against a high default (high, xhigh) Auto saves a lot: a median xhigh prompt cost about three times a medium one.
- Against a medium default it mostly saves a few percent, and gives hard jobs high on their own.
- Keeping chats short and compacting before the cache goes cold often saves more than effort does. That is what the countdown is for.

## How often the judge is right

`/effortless bench` runs labelled prompts through each judge you have set up, using the same code a real prompt goes
through, and scores them against a fixed effort. Each case lists the efforts a careful person would accept for that
message on that model. The cases are in [`bench/judge-cases.json`](bench/judge-cases.json); run it yourself.

Two runs on version 1.4.1, 52 cases, Sonnet and Opus 5.5:

| Judge | Right | Too low | Too high | Median time |
| --- | --- | --- | --- | --- |
| Always medium | 44% | 12 | 17 | - |
| Always high | 50% | 0 | 26 | - |
| Haiku | 85-88% | 1 | 5-7 | 0.73 s |
| Jev | 92-94% | 1 | 2 | 0.25 s |

What this does and does not show:

- It measures whether the judge picks a sensible effort, not how much a session costs or how good the answers are.
- 52 cases is a small set, and the judges are not fully deterministic: runs differ by a few points.
- The judge prompts were then tuned on these cases (1.4.2). 20 held-out cases, written before that tuning and never
  tuned against, are reported on their own line by the bench. Quote that line, not the tuned one.
- Weakest kind: short answers to a question ("yes", "the second one"), right 57-71% of the time.

## Models

Effort only changes on Opus 5.5 and Sonnet 5.5. On Fable 5.1 and older models a change of effort between requests rewrote most of the prompt cache, which costs more than it saves, so Auto pauses there and the footer says `Paused`. Haiku takes no effort setting.

## Develop

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT
