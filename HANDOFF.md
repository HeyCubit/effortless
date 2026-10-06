# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.27.9, pushed and installed. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, `<cli> plugin validate .`, `<cli> plugin test .`
  (0 fail), push, `<cli> plugin marketplace update effortless`, `<cli> plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder). `claude` on PATH is
  2.1.220: fails validate, has no `plugin test`.
- Another chat builds a showcase site in `site/` in its own worktree. Leave `site/` alone.
- The main checkout (`~/Documents/effortless`) had two local `test(aid)` commits not on origin (2026-10-06), from
  another chat. Not pushed by the setup release.

## Half done
- Setup in steps: confirmed working by Isac in 1.27.6 (clicks, saves at Done, footer checkboxes).
- 1.25.0 handoff bar: not yet seen in the app at narrow widths, Enter on Go, copy to the clipboard on desktop.
- Branding images in `docs/brand/` (social preview, README banner, band strip, avatar): untracked, not in README.
- README does not mention the "Swamped at" setting yet.
- Not yet seen in the app: settings opened before a chat's first message (1.20.1), Show > Cache timer (1.21.0),
  Swamped at (1.23.0).

## Next
0. Split view: the app draws plugin UI only in the left pane (proven: right pane asked 8x then never). Separate
   windows both work (README says so). Bug report written; Isac sends it via /feedback.
1. Setup at narrow widths (under ~80 columns) not yet seen.
2. Needs Isac: restart, ⇥ then Quick + Go in a chat with replies, then `/effortless debug`. Expect
   `last fork: answered`; else fix by reason (`nothing-to-fork`, `aborted`, `api-error`, `threw`).
3. On Isac's OK: banner at top of README, document Swamped at, commit `docs/brand/`.
4. Ideas, not started: progress bars and sound, each a footer checkbox in setup step 4 (`SETUP_FOOTER`); one effort change on Fable while the cache is still small (new chat, right after a
   compact), where a rewrite costs almost nothing.

## Decided, do not redo
- Setup steps (2026-10-06): judge, lean, handoff skill, footer (cache timer + ⇥, recommended on), done line on ⏻, ⚙ and Fable. Range, Swamped at,
  handoffAfter, alert bands stay in ⚙ only. Choices save together at Done or ✕. Picking or skipping the judge ends "Setup" in the footer.
- Setup and handoff bars use still art (each click redraws them); the alert bands keep animated art.
- Handoff bar stays brand purple; other colours mean alerts. Variants in docs/brand/previews/.
- Auto pauses on Fable 5.1 and older Opus: an effort change rewrote 56 to 100% of the cache (measured).
- Status line removed (1.23.1). Swamp band = one percent setting `swampAt` (default 50), no token rule.
- `/split` dropped: no `start_session` tool for mods. Footer hover cards impossible.

## Only Isac
- Visual checks in the desktop app and the handoff run above.
- A separate GitHub account if full anonymity is wanted.

## Pointers
- Code `hooks/register.tsx` (setup: `setupNext`, `goSetup`, `pickJudge`, the "setup guide" block), tests
  `tests/effortless.test.ts`, command file `commands/effortless.md`.
- Spec: `docs/superpowers/specs/2026-10-06-setup-steps-design.md`.
- Judge benchmark: `bench/judge-cases.json`. Band styling limits: memory `mod_band_styling.md`.
- Mod state: memory `modellval_mod.md`.
