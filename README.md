<p align="center">
  <img src="docs/readme/banner.png" alt="effortless, a Claude Code mod: one bar above the prompt that picks the reasoning effort for every prompt" width="100%">
</p>

<p align="center">
  <a href="https://heycubit.github.io/effortless/"><b>Website</b></a> ·
  <a href="#install"><b>Install</b></a> ·
  <a href="#what-the-bar-shows"><b>What it shows</b></a> ·
  <a href="#pick-your-judge"><b>Judges</b></a>
</p>

A Claude Code mod that picks the reasoning effort for every prompt. Easy questions run on **Low**, hard jobs get
**High**, and you never touch the Effort control. One bar above the prompt also shows how full the chat is, how long
the prompt cache stays warm, and hands off or compacts in one click when a chat gets heavy.

<p align="center">
  <img src="docs/readme/story.gif" alt="effortless in a Claude Code chat: effort per prompt, Handoff, cold cache, heavy chat, limits and settings" width="100%">
</p>

## Install

Two ways. Both take a minute and need no terminal.

**1. Ask Claude** (easiest). Paste this into Claude Code and press Enter:

```text
Install the effortless plugin for me: run `claude plugin marketplace add HeyCubit/effortless` and then `claude plugin install effortless@effortless`. When both succeed, tell me to run /reload-plugins.
```

**2. Commands.** Type these two lines in Claude Code's chat box:

```text
/plugin marketplace add HeyCubit/effortless
```

```text
/plugin install effortless@effortless
```

Or in a terminal, in one line:

```bash
claude plugin marketplace add HeyCubit/effortless; claude plugin install effortless@effortless
```

Then run `/reload-plugins` (or restart Claude Code). A short setup opens above the prompt: pick **Haiku** (one click,
no key, runs on your own Claude login), **Jev** (a TypeSafe key, about 4x faster) or **your own AI**, lean cheaper or
smarter, and pick how handoffs are written. Run `/effortless setup` to go through it again, or change any of it in ⚙.

Updates come to you: when a new version is out, a card above the prompt offers **Update** or **Later**.

## What the bar shows

<p align="center"><img src="docs/readme/hero.gif" alt="The bar: Deciding, then Low for a quick question, then High for a refactor" width="100%"></p>

| On the bar | Means |
|---|---|
| **High** | the effort Auto picked for this prompt. `Deciding` while the judge thinks; a switch flashes violet and fades to white |
| **◔ 38%** | how full the chat's context is |
| **cache 59:00** | time until the prompt cache goes cold, after which the next message pays full price to re-read the chat |
| *Haiku: a refactor…* | who judged and why |
| **Auto** | switches the judge on and off. Changing effort in the app yourself also turns Auto off: you always win |
| **Handoff** | appears as the chat fills: a grey box from 15%, white from 30%, with a glow that grows to 80% |
| **⚙** | settings |

Prefer it quiet? Settings → Appearance has a **Minimal** look with no bar.

### When a chat gets heavy

When the cache has gone cold on a big chat, the bar turns to ice with **Compact** and **Handoff**:

<p align="center"><img src="docs/readme/cold.gif" alt="The Chat went cold bar, breathing" width="100%"></p>

**Handoff** writes a summary of the chat and carries on in a clean one. **Quick** takes a few seconds; **Full** checks
git and saves `HANDOFF.md` (or runs your own skill). Then clear and carry on, clear and wait, or keep the chat and copy.

<p align="center"><img src="docs/readme/handoff.png" alt="The Handoff bar with Quick and Full" width="100%"></p>

**Compact** takes an optional note for what the summary should keep, passed to `/compact`:

<p align="center"><img src="docs/readme/compact.png" alt="The Compact bar with an optional summary field" width="100%"></p>

The bar also warns when a chat is getting swamped (each message re-reads a lot of context), when a 5-hour or weekly
limit passes 80% (with a Save mode that caps effort at Medium), and when your judge stops answering.

### Settings

<p align="center"><img src="docs/readme/settings.png" alt="The settings panel: Effort, Judge, Handoff, Appearance" width="100%"></p>

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
- Like any Claude Code plugin, this mod runs code on your machine. Its code is in [`hooks/`](hooks/): read it before you install if you do not know the author. The only program it starts is `claude` itself, to update or uninstall the mod when you press those buttons.

## What it saves, honestly

Measured over 80k requests of real Claude Code use, about 76% of the cost is the context being read back from the cache on every tool call, 16% cache writes and only 8% output. Effort mostly changes how many tool calls a prompt makes.

- Against a high default (high, xhigh) Auto saves a lot: a median xhigh prompt cost about three times a medium one.
- Against a medium default it mostly saves a few percent, and gives hard jobs high on their own.
- Keeping chats short and compacting before the cache goes cold often saves more than effort does. That is what the countdown is for.

## How often the judge is right

`/effortless bench` runs labelled prompts through each judge you have set up, using the same code a real prompt goes
through, and scores them against a fixed effort. Each case lists the efforts a careful person would accept for that
message on that model. The cases are in [`bench/judge-cases.json`](bench/judge-cases.json); run it yourself.

Two runs on version 1.5.1, 73 cases, Sonnet and Opus 5.5:

| Judge | Right, all 73 | Right, 20 held out | Too low | Too high | Median time |
| --- | --- | --- | --- | --- | --- |
| Always medium | 44% | 40% | 17 | 24 | - |
| Always high | 51% | 50% | 0 | 36 | - |
| Haiku | 92-93% | 95% | 1 | 4-5 | 0.75 s |
| Jev | 99% | 100% | 0 | 1 | 0.24 s |

What this does and does not show:

- It measures whether the judge picks a sensible effort, not how much a session costs or how good the answers are.
- 73 cases is a small set, and the judges are not fully deterministic: runs differ by a few points.
- The judge prompts were tuned on 53 of the cases. The 20 held-out cases were never tuned against, so that column is
  the honest one. They were written after the first run showed which kinds of message miss, so they are not blind.
- Haiku's remaining misses are mostly "yes" or "thanks" after hard work, where it keeps the effort high.

## Models

Effort only changes on Opus 5.5 and Sonnet 5.5. On Fable 5.1 and older models a change of effort between requests rewrote most of the prompt cache, which costs more than it saves, so Auto pauses there and the footer says `Paused`. Haiku takes no effort setting.

## Split view

In the desktop app's split view, Claude Code draws plugin bars only in the left pane. The right pane still draws
replies, so when a chat went cold, is getting swamped or runs hot, a small card in the bar's colours hangs under the
newest reply, naming the command that does what the bar's button would: `/compact`, `/effortless handoff` or
`/effortless save`.

## In the terminal

effortless draws in the terminal CLI too, with moving pixel art in its bands. Claude Code may not load a plugin's code
there yet: if `/effortless` says the mod is not loaded after a restart, add this to `~/.claude/settings.json` and
restart:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

Tested on Claude Code 2.1.285 (stable), 2.1.286 and 2.1.288 at 80 and 120 columns. Below 90 columns the bands leave their art out.

## Commands

| Command | Does |
|---|---|
| `/effortless settings` | opens the settings panel |
| `/effortless setup` | runs the setup again |
| `/effortless auto` | Auto on or off |
| `/effortless handoff` / `handoff full` | hands off without the bar, with your last choice of what follows |
| `/effortless stats` | what the prompts Auto steered cost this session, per effort, and what the judge took |
| `/effortless cold`, `swamp`, `hot`, `down` | shows that bar now, to try it |
| `/effortless bench` | scores each judge you have on the labelled prompts in [`bench/judge-cases.json`](bench/judge-cases.json) |
| `/effortless update` | checks for a new version now |

## Open source

effortless is MIT licensed. Like any Claude Code plugin it runs code on your machine, so the whole mod is here to read:
[`hooks/`](hooks/). It sends nothing anywhere except your prompt to the judge you picked.

## Develop

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

`tools/render-band` draws the bar the way the desktop app does, without opening it; the images in this README come from it.

## License

[MIT](LICENSE)
