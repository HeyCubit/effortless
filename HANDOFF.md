# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.34.7, pushed and installed. Direct pushes, no open PRs. Several chats push
  to main: fetch and rebase before every push, and read the version after the pull (others bump it too).
- Release: bump `version` in `.claude-plugin/plugin.json`, `<cli> plugin validate .`, `<cli> plugin test .`
  (0 fail), push, `<cli> plugin marketplace update effortless`, `<cli> plugin update effortless@effortless`, restart.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder). The agent sandbox sees a
  virtualised AppData, so Isac uses plain `claude`. `claude` on PATH is old: no `plugin test`.
- Showcase site: live at https://heycubit.github.io/effortless/ (Pages serves branch `gh-pages`, which holds the
  contents of `site/`; publish with a commit whose tree is `main:site`). Logo upload as the repo social preview
  waits for Isac (`brand/social-preview.png`). Design notes: ai-setup `memory/effortless/site-design.md`.
  Untracked `docs/brand/` waits for Isac.

## Where things stand
- Terminal release is live (1.34.x): alert bands draw two lines with moving half-block pixel art on the right
  (`hooks/art.ts`; `bandArt`, `terminalBand`, `terminalPanel` in `hooks/register.tsx`), no art under 90 columns,
  effort row stays under a band, setup and handoff bars stack, progress track draws as characters.
- Settings: Show offers only Progress and Sounds (plain ☑/☐). Alerts and the line under replies always show;
  `HIDEABLE` is handoff, timer, progress, sounds. Setup is 3 steps: judge, lean, handoff.
- Save mode paints the footer's effort level ember (desktop, Isac saw it).

## Not done / unverified
- Terminal band hotkeys (c Compact, h Handoff, s Save/Settings, n Not now): ctrl+x tab did not focus the band from
  the pty harness. Needs a real terminal.
- Terminal settings panel: no art, no Esc (a band cannot take Esc; only a Pane can).
- Compact card after a band's Compact button: not seen on the terminal.
- Minimum CLI version for mods: unknown; README needs a terminal section.
- Desktop, not yet seen by Isac: slimmer settings panel, 3-step setup, green done card, "Compact complete", bands
  hidden while compacting, swamp band waiting for the turn to end, progress sounds in a real task.

## Next
1. Isac checks the settings panel and `/effortless setup` in the app.
2. Isac tries a terminal band's hotkeys (`/effortless swamp`, ctrl+x tab, c).
3. README terminal section with the minimum CLI version.

## Decided, do not redo
- Terminal art is a `Raster` of `▀` cells (`Image` shows only alt text in Windows Terminal). Alert bands move, bars
  are still. Isac wants visual elements in the CLI; that is the point of the terminal release.
- Fewer choices (Isac): judge stays a choice; alerts are not options; Progress and Sounds stay switchable. No x
  hotkey on close buttons; s for Save is fine.
- Swamp shows only as the band, never a card. Band and cards wait while a turn runs (`turnBusy`).
- Compact uses the handoff card: purple "Compacting…", green "Compact complete"; bands step aside while compacting.
- Progress bar spec `docs/specs/2026-10-06-progress-bar.md`. Setup spec
  `docs/superpowers/specs/2026-10-06-setup-steps-design.md` (its step 4 is gone).
- Auto pauses on Fable 5.1 and older Opus (an effort change rewrote 56 to 100% of the cache).
- Split view: bands draw only in the LEFT pane. Isac stopped the hunt.

## Only Isac
- Visual checks in the app and his real terminal; taste on the terminal art.
- Send the split-view bug via `/feedback`. README banner and Swamped-at docs wait for his OK.

## Pointers
- Terminal spec `docs/superpowers/specs/2026-10-06-terminal-art-design.md`, audit `docs/terminal-audit-2026-10-06.md`,
  screenshot `docs/terminal-bands-1.34.0.png`.
- Terminal checks: a pywinpty + pyte harness drives `claude.exe` at a fixed size and dumps the screen (not in the
  repo). In Git Bash set `MSYS_NO_PATHCONV=1` or `/effortless` turns into a path. `--plugin-dir` starts a fresh store.
- Tests `tests/effortless.test.ts`. Memories `mod_band_styling.md`, `mod_engine_module_rules.md`, `modellval_mod.md`.
