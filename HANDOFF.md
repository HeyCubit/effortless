# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.23.0. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, `claude plugin validate .`, `claude plugin test .`
  (0 fail), push, `claude plugin marketplace update effortless`, `claude plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder).

## Half done
- Handoff: queued by `/effortless handoff` or the footer button, written from the 1 s session timer
  (`writeHandoff` in `hooks/register.tsx`). Built-in path is `$.model.fork`; the last real run fell back to a turn.
  1.21.2 records why: `lastFork` in the store, shown as `last fork:` in `/effortless debug`, and a toast on fallback.
- 1.22.0 status line (`statusText`): `cache 57m · ctx 42% · 420k/1.0M · Auto High (jev)`. The app cuts a long
  status line and shows it whole on hover; not yet seen in the app.
- 1.23.0: swamp band follows `swampAt` (settings Handoff row, default 50%), no token rule. Band art is a still
  image unless Show > Animation is on (`animate`): the live frame flickered on resize/scroll. Flicker fix unseen.
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
- Visual sign-off in the desktop app (tests cannot see what it draws): status-line hover, no flicker, the handoff run.
- A separate GitHub account if full anonymity is wanted (pusher shows in the repo events API).

## Pointers
- Code `hooks/register.tsx`, tests `tests/effortless.test.ts` (90), command file `commands/effortless.md`.
- Judge benchmark: `bench/judge-cases.json`, README "How often the judge is right".
- Band styling recipe and limits: memory `mod_band_styling.md`. Mod state: memory `modellval_mod.md`.
