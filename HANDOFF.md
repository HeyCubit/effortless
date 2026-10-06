# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.26.0, pushed and installed. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, `claude plugin validate .`, `claude plugin test .`
  (0 fail), push, `claude plugin marketplace update effortless`, `claude plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder). `claude` on PATH is 2.1.220: fails validate, has no `plugin test`.

## Half done
- 1.25.0: ⇥ opens a handoff bar (Quick fork / Full skill; Clear & carry on / Clear & wait / Keep chat & copy),
  remembered in the store as `handoffChoice`. The old "fork falls back" was the skill setting, not a fork failure.
  Not yet seen in the app: the bar's layout at narrow widths, Enter on Go, copy to the clipboard on desktop.
- Branding images in `docs/brand/` (social preview, README banner, band strip, avatar): untracked, not in README.
- README does not mention the "Swamped at" setting yet.
- Not yet seen in the app: settings opened before a chat's first message (1.20.1), Show > Cache timer (1.21.0),
  Swamped at (1.23.0).

## Next
0. Split view: the mod shows only in the left pane. Unknown if the app or the mod. Needs `/effortless debug` from the
   right pane: `band asked for 0 times` = app limit (report it), more = mod bug.
1. Needs Isac: restart, ⇥ then Quick + Go in a chat with replies, then `/effortless debug`. Expect `last fork: answered`.
   Else fix by reason: `nothing-to-fork`, `aborted` (timer dispatch cut), `api-error`, `threw`.
2. On Isac's OK: banner at top of README, document Swamped at, commit `docs/brand/`.

## Decided, do not redo
- Handoff bar stays brand purple (Isac 2026-10-06); other colours mean alerts. Variants in docs/brand/previews/.
- Status line removed (1.23.1): when it fits, the app shows it whole, so no hover; it duplicated the footer.
- Band art always animates (1.23.2); the flicker on resize/scroll is accepted. No still-image option.
- Swamp band = one percent setting `swampAt` (default 50), no token rule.
- `/split` dropped: no `start_session` tool for mods or this session.
- Footer hover cards impossible (footer ignores display none/absolute).

## Only Isac
- Visual checks in the desktop app and the handoff run above.
- A separate GitHub account if full anonymity is wanted.

## Pointers
- Code `hooks/register.tsx`, tests `tests/effortless.test.ts` (96), command file `commands/effortless.md`.
- Judge benchmark: `bench/judge-cases.json`. Band styling limits: memory `mod_band_styling.md`.
- Mod state: memory `modellval_mod.md`.
