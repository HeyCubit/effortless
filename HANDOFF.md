# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.30.4 (progress bar: scaling still track, branded animated background across the band, thinking pill while planning), pushed and installed. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, `<cli> plugin validate .`, `<cli> plugin test .`
  (0 fail), push, `<cli> plugin marketplace update effortless`, `<cli> plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder). `claude` on PATH is
  2.1.220: fails validate, has no `plugin test`.
- Another chat builds a showcase site in `site/` in its own worktree. Leave `site/` alone.
- The main checkout (`~/Documents/effortless`) had two local `test(aid)` commits not on origin (2026-10-06), from
  another chat. Not pushed by the setup release.

## Half done
- 1.29.0 progress bar: tested in the plugin test kit (desktop and terminal); PowerShell plays the chime on this PC.
  Not yet seen or heard in the app: `/effortless progress`, `progress ask`, `progress done`, then a real task.
  No chime: `/effortless debug` ends with `last chime:` and the reason.
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
4. Ideas, not started: Progress and Sounds as checkboxes in setup step 4 (`SETUP_FOOTER`; left out of 1.29.0 to keep
   the confirmed step-4 layout); one effort change on Fable while the cache is still small (new chat, right after a
   compact), where a rewrite costs almost nothing.

## Decided, do not redo
- Progress bar design (Isac 2026-10-06): the track is one still image that scales to the band (pills: done filled, no
  ticks; current half filled with a lit edge; pending outline). All motion is in the art across the whole band
  (wash, light sweep, sparkles, speed lines; ? when asking; rising ticks when done). Interactive Svg needs both sizes.
  Finish line is a flag that turns into a ticked circle. Done shows before the alert bands (Isac: swamp hid it).
  Chimes softened after Isac called the first ones terrible.
- Progress bar (2026-10-06, design left to the builder): 3+ steps from TodoWrite or TaskCreate/TaskUpdate; a judge
  pick of high+ shows "Planning" first; yellow + chime when Claude asks, green + chime when done. Active bar above
  the alert bands, done/paused below. Plain Box/Text. Off: `progress`, `sounds` in `hide` and Settings > Show.
  Spec `docs/specs/2026-10-06-progress-bar.md`. Engine rules (one hook per event, $ never across an import, atoms
  per file): memory `mod_engine_module_rules.md`. Windows chimes via PowerShell SoundPlayer on the handoff timer.
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
