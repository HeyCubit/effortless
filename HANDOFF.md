# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.21.2. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, `claude plugin validate .`, `claude plugin test .`
  (0 fail), push, `claude plugin marketplace update effortless`, `claude plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder).

## Half done
- Handoff: queued by `/effortless handoff` or the footer button, written from the 1 s session timer
  (`writeHandoff` in `hooks/register.tsx`). Built-in path is `$.model.fork`; the last real run fell back to a turn.
  1.21.2 records why: `lastFork` in the store, shown as `last fork:` in `/effortless debug`, and a toast on fallback.
- Not yet checked in the app: settings opened before a chat's first message (store bridge, 1.20.1) and
  Show > Cache timer (1.21.0).

## Next
- Run a handoff in a chat that has replies, read `last fork:` in `/effortless debug`, fix by reason:
  - `nothing-to-fork`: the timer's session has no main-thread response yet (pre-first-message restart).
  - `aborted`: the timer dispatch was cut; move the fork elsewhere or retry.
  - `api-error`: retry on rate_limit/overloaded, else fall back as now.
  - `threw`: the fork is refused from a timer hook; find a hook it is allowed from.
- Rerun `/effortless bench` after any judge-prompt change; report the held-out line.

## Only Isac
- Visual sign-off in the desktop app (tests cannot see what it draws), and the handoff run above.
- A separate GitHub account if full anonymity is wanted (pusher shows in the repo events API).

## Pointers
- Code `hooks/register.tsx`, tests `tests/effortless.test.ts` (87), command file `commands/effortless.md`.
- Judge benchmark: `bench/judge-cases.json`, README "How often the judge is right".
- Band styling recipe and limits: memory `mod_band_styling.md`. Mod state: memory `modellval_mod.md`.
