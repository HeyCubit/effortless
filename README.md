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

Restart Claude Code. A short setup opens above the prompt the first time: pick **Jev** (API key needed, about 4x faster than Haiku), **Haiku** (one click, no key, runs on your own Claude login) or **your own AI**, and it asks only for what that choice needs. Then two short steps: lean cheaper or smarter, and which skill writes a full handoff. Back on every step; your choices are saved when you press Done or close it. Run `/effortless setup` to go through it again, or change any of it in ⚙.

From a terminal it is the same without the slashes: `claude plugin marketplace add HeyCubit/effortless`, then `claude plugin install effortless@effortless`.

### In the terminal

effortless draws in the terminal CLI too, with moving pixel art in its bands. Claude Code may not load a plugin's code
there yet: if `/effortless` says the mod is not loaded after a restart, add this to `~/.claude/settings.json` and
restart:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

Tested on Claude Code 2.1.285 (stable), 2.1.286 and 2.1.288 at 80 and 120 columns. Below 90 columns the bands leave their art out.

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
- Like any Claude Code plugin, this mod runs code on your machine. It is two files, [`hooks/register.tsx`](hooks/register.tsx) and [`hooks/progress.tsx`](hooks/progress.tsx): read them before you install if you do not know the author. On Windows the progress bar's chimes are played by PowerShell's sound player; that is the only program it starts.

## Progress bar

When Claude works through a bigger task, a bar above the prompt follows it. It appears once Claude writes a step list of 3 or more steps (or, before that, as "Planning" while Claude is in plan mode). A line in the system prompt asks Claude to keep such a list for work of three or more steps, fills one segment per step toward the flag at the end, and names the step in progress.

- **Yellow**, with a chime: Claude asks you something (a question card, or a reply that ends on a question).
- **Green**, with a chime: every step is done. It stays until your next message or ✕.
- ✕ on a running bar hides it until Claude writes a new list.

Switch it off in `/effortless settings` under Show: **Progress** (the whole bar) or **Sounds** (the chimes only).

## Commands

| Command | Does |
|---|---|
| `/effortless setup` | run the setup again |
| `/effortless auto` | Auto on or off |
| `/effortless stats` | what the prompts Auto steered cost this session, per effort, and what the judge took |
| `⇥` in the footer | opens the handoff bar: **Quick** (a fork writes it in seconds) or **Full** (your own skill, setting `handoffSkill`, which can check git and save files), then **Clear & carry on**, **Clear & wait** or **Keep chat & copy**. A line in the bar says what will happen; it remembers your last choice. The swamp band's Handoff opens the same bar |
| `/effortless handoff` / `handoff full` | the same without the bar, with the last choice of what follows |
| `/effortless hot`, `/effortless down` | show the running-hot band (a 5h or weekly limit past 80%, with Save mode) or the judge-down band now, to try them |
| `/effortless swamp` | shows the swamp band now, to try it (it appears by itself once each message re-reads 150k+ tokens) |
| `/effortless cold` | shows the cache as cold now, to try the Compact button |
| `/effortless progress` | a demo progress bar; `progress ask` and `progress done` show yellow and green with their chimes, `progress clear` removes it |
| `/effortless bench` | runs the 75 labelled prompts (20 held out) in `bench/judge-cases.json` through each judge you have (Haiku, plus Jev and your own if set up) and saves a score table next to fixed medium/high |

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

In the desktop app's split view, Claude Code draws plugin bars and the footer only in the left pane. The right pane still draws replies, so when the chat went cold, is getting swamped or runs hot, a small card in the band's colours hangs under the newest reply, naming the command that does what the band's button would: `/compact`, `/effortless handoff` or `/effortless save`. Chat cards cannot hold buttons, so it is a command there. In the terminal the line under each reply also shows the effort and the cache. Switch both off in ⚙ under what shows.

## Develop

```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT
