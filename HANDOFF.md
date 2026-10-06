# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.33.3, pushed and installed. Direct pushes, no open PRs. Several chats push
  to main: fetch and rebase before every push.
- Release: bump `version` in `.claude-plugin/plugin.json`, `<cli> plugin validate .`, `<cli> plugin test .`
  (0 fail), push, `<cli> plugin marketplace update effortless`, `<cli> plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder). `claude` on PATH is
  2.1.220: fails validate, has no `plugin test`.
- Another chat builds a showcase site in `site/` in its own worktree. Leave `site/` alone.
- Untracked `docs/brand/` (branding images): waits for Isac's OK on the README banner.

## Next phase: the terminal (CLI) release
Isac wants effortless released for the terminal too. Nothing built yet; findings so far (code read + a throwaway
probe that mounted every band on `surface: 'terminal'` in the test kit, test file restored):
- Already terminal-aware: effort row above the prompt (`SessionMode`, `e.surface !== 'terminal'`), the line under
  each reply (`TurnDuration`), progress bar text track (`hooks/progress.tsx`, `Svg?` optional).
- Cold, swamp, hot, judge-down bands, settings, setup and handoff bar all draw on terminal (text + buttons), but
  their art Box is empty there (no Svg) and the layout (absolute boxes, fills, fixed widths) is desktop-tuned.
- A band replaces the effort row, so the effort is hidden while a band shows (desktop keeps it in the footer).
- Cards under replies (`AssistantMessage`: handoff, compact, cold/hot warning) unverified on terminal.
- Unknown: the lowest CLI version that runs these mods; README must say it.

Open decisions for Isac (suggestion in brackets):
1. Band art on terminal: [a few still coloured characters on the right, e.g. ❄ ∘ ✦] or plain text.
2. Keep the effort row as one line under a band? [yes]
3. Release scope: [effort row + bands + progress bar first; reply cards later] or full parity.

## Next
1. See the real terminal: run the newest `claude.exe` (path above) in a tab via the Terminal panel tools
   (`run_in_terminal` / `read_terminal`), at 80 and 120 columns. Trigger `/effortless swamp`, `cold`, `hot`,
   `down`, `progress`, `settings`, `setup`, `handoff`. Record what breaks. Do not drive Isac's desktop.
2. Ask Isac decisions 1-3 above (one round), then plan the terminal pass (likely a `terminal` branch per band in
   `hooks/register.tsx` AbovePrompt, plus tests on `surface: 'terminal'`).
3. Find the minimum CLI version for mods; add a terminal section to README.

## Seen in the app vs not
- Seen working by Isac: handoff card (purple, "Handoff complete" before it turned green), compact card
  ("Compacting…"), warning card, setup steps, compacting state.
- Not yet seen: green done card (1.31.1), "Compact complete" green card, bands hidden while compacting (1.33.1),
  swamp band waiting for the turn to end (1.32.0), progress bar sounds in a real task, handoff bar at narrow widths.

## Decided, do not redo
- Swamp shows only as the band above the prompt, never as a card in the chat (Isac). Band and cards wait while a turn
  runs (`turnBusy`, cleared on turn.complete incl. aborted; 10 min stale guard).
- Compact (swamp or cold band) uses the handoff card: purple "Compacting…" with sparkles, green "Compact complete"
  with a checkmark (`DONE_SVG`); bands step aside while compacting. No progress wheel: compact reports no progress.
- Landed handoff/compact cards are green (`cardLanded`); copied / sent on stay purple. No "split view" tag: the
  plugin cannot tell which pane draws.
- Progress bar design and rules: spec `docs/specs/2026-10-06-progress-bar.md`. Done shows before alert bands.
- Setup steps: spec `docs/superpowers/specs/2026-10-06-setup-steps-design.md`. Setup/handoff bars use still art;
  alert bands animate. Handoff bar stays brand purple.
- Auto pauses on Fable 5.1 and older Opus: an effort change rewrote 56 to 100% of the cache (measured).
- Status line removed (1.23.1). Swamp band = one percent setting `swampAt` (default 50).
- Split view: bands, footer, bars draw only in the LEFT pane; right pane draws replies only. Isac stopped the hunt.

## Only Isac
- Visual checks in the desktop app; the decisions above.
- Send the split-view bug via `/feedback`. README banner + Swamped at docs: waiting for his OK.

## Pointers
- Code `hooks/register.tsx`, `hooks/progress.tsx`; tests `tests/effortless.test.ts`; command `commands/effortless.md`.
- Band styling limits: memory `mod_band_styling.md`. Engine rules: `mod_engine_module_rules.md`. Mod state:
  `modellval_mod.md`. Judge benchmark: `bench/judge-cases.json`.
