# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.23.2, pushed and installed. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, `claude plugin validate .`, `claude plugin test .`
  (0 fail), push, `claude plugin marketplace update effortless`, `claude plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder).

## Half done
- Handoff fork still falls back to a turn. 1.21.2 logs why: `lastFork` in the store, `last fork:` in
  `/effortless debug`, toast on fallback. Reason not yet read from a real run.
- Branding images in `docs/brand/` (social preview, README banner, band strip, avatar): untracked, not in README.
- README does not mention the "Swamped at" setting yet.
- Not yet seen in the app: settings opened before a chat's first message (1.20.1), Show > Cache timer (1.21.0),
  Swamped at (1.23.0).

## Next
1. Isac runs Handoff in a chat with replies, then `/effortless debug`; fix by the `last fork:` reason:
   `nothing-to-fork` (no main-thread reply in that session), `aborted` (timer dispatch cut), `api-error`
   (retry rate_limit/overloaded), `threw` (fork refused from a timer hook).
2. On Isac's OK: banner at top of README, document Swamped at, commit `docs/brand/`.

## Decided, do not redo
- Status line removed (1.23.1): when it fits, the app shows it whole, so no hover; it duplicated the footer.
- Band art always animates (1.23.2); the flicker on resize/scroll is accepted. No still-image option.
- Swamp band = one percent setting `swampAt` (default 50), no token rule.
- `/split` dropped: no `start_session` tool for mods or this session.
- Footer hover cards impossible (footer ignores display none/absolute).

## Only Isac
- Visual checks in the desktop app and the handoff run above.
- A separate GitHub account if full anonymity is wanted.

## Pointers
- Code `hooks/register.tsx`, tests `tests/effortless.test.ts` (89), command file `commands/effortless.md`.
- Judge benchmark: `bench/judge-cases.json`. Band styling limits: memory `mod_band_styling.md`.
- Mod state: memory `modellval_mod.md`.
