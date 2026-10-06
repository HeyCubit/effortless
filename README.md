# modellval

A Claude Code mod that picks the reasoning effort for every prompt, so easy questions run on low and hard jobs get high, without you touching the Effort control. It also shows how long the prompt cache stays warm, with one-click Compact when it goes cold.

```
⏻  Medium  42m
```

- **Medium**: the effort Auto picked for this prompt (purple). `Deciding…` while it judges, `Low → High` for a moment after a switch, `Off` when Auto is off.
- **⏻**: turns Auto on and off. Changing effort in the app yourself also turns Auto off: you always win.
- **42m**: time until the prompt cache goes cold. Grey, yellow from 20 minutes, red from 5. Then `Cold` with a **Compact** button: the next message would otherwise write the whole context to the cache again.

## Install

```bash
claude plugin marketplace add Segueapp/modellval
claude plugin install modellval@modellval
```

Restart Claude Code. It works right away with Haiku as the judge, on your own Claude login, no key needed.

## Pick your judge

Run `/plugin configure modellval@modellval` in Claude Code, or set it at install time with `--config judge=...`. Left unset, `auto` applies.

| Judge | What it needs | Speed |
|---|---|---|
| `auto` (default) | Jev when a TypeSafe key is found, Haiku otherwise | |
| `haiku` | nothing, uses your Claude login | about 1 s |
| `jev` | a [TypeSafe](https://typesafe.ai) key, in the settings, `TYPESAFE_API_KEY`, or `~/.config/jev/.env` | about 0.25 s |
| `custom` | any OpenAI-compatible chat completions endpoint: URL, model and key | depends |

Custom examples:

| Provider | URL | Model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1/chat/completions` | `llama-3.1-8b-instant` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | any |
| Ollama (local) | `http://localhost:11434/v1/chat/completions` | `llama3.2`, no key |

Keys are stored as secret settings by Claude Code, never in a file of this repo. If a judge fails or takes longer than 3 seconds, modellval falls back to Haiku for that prompt.

Short follow-ups such as "go", "ok" or "yes" keep the effort already picked and ask no judge.

## Commands

| Command | Does |
|---|---|
| `/modellval auto` | Auto on or off |
| `/modellval stats` | what the prompts Auto steered cost this session, per effort, and what the judge took |
| `/modellval cold` | shows the cache as cold now, to try the Compact button |

## What it saves, honestly

Measured over 80k requests of real Claude Code use, about 76% of the cost is the context being read back from the cache on every tool call, 16% cache writes and only 8% output. Effort mostly changes how many tool calls a prompt makes.

- Against a high default (high, xhigh) Auto saves a lot: a median xhigh prompt cost about three times a medium one.
- Against a medium default it mostly saves a few percent, and gives hard jobs high on their own.
- Keeping chats short and compacting before the cache goes cold often saves more than effort does. That is what the countdown is for.

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
