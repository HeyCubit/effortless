# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.24.0, pushed and installed. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, `claude plugin validate .`, `claude plugin test .`
  (0 fail), push, `claude plugin marketplace update effortless`, `claude plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder). `claude` on PATH is 2.1.220: fails validate, has no `plugin test`.

## Half done
- 1.24.0: ⇥ = quick handoff (fork, built-in prompt), ⇥⇥ = full (handoffSkill as a turn). The earlier "fork falls
  back" was the skill setting: with a skill set, every handoff ran the skill and never forked. Fork not yet seen
  answering in the app.
- Branding images in `docs/brand/` (social preview, README banner, band strip, avatar): untracked, not in README.
- README does not mention the "Swamped at" setting yet.
- Not yet seen in the app: settings opened before a chat's first message (1.20.1), Show > Cache timer (1.21.0),
  Swamped at (1.23.0).

## Next
1. Needs Isac: restart, press ⇥ in a chat with replies, then `/effortless debug`. Expect `last fork: answered`.
   Else fix by reason: `nothing-to-fork`, `aborted` (timer dispatch cut), `api-error`, `threw`.
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
