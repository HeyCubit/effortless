# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.35.103, pushed and installed. Direct pushes, no open PRs. Several chats push
  to main: `git pull --rebase --autostash` before every push, and read the version after the pull.
- Release: `tools/release.sh [--no-install] "<subject>" "<body>"` runs the tests (155 pass) and stops on any failure,
  bumps the version here and in `.claude-plugin/plugin.json`, adds the subject to `releases.json`, commits, pushes and
  installs. `--no-install` leaves this machine a version behind so the update card can be tried. Use `py`, not `python`.
- Showcase site: https://heycubit.github.io/effortless/ (`gh-pages` = `main:site`). The redesign (bar-first, a
  /whats-new/ page built from releases.json) is on branch `site-story`, not live: waits for Isac's OK in the site chat.
  After it merges, add `node site/src/build.mjs` + republish to `tools/release.sh`.

## Where things stand
- Dashboard bar is the default look; Minimal stays as a setting (Settings → Appearance).
- Update card (1.35.80-1.35.92): reads releases.json from the effortless marketplace after `claude plugin marketplace
  update` (git; the host's web fetch was cached), offers Update/Later (Later = a day), runs `claude plugin update`, then
  `/reload-plugins` via `$.command.run`; the new load shows "Updated to X" + What's new → /whats-new/. Checked on the
  band's first draw after any load (reload fires no session.start) and every 6 h. Confirmed working end to end in the app.
- Handoff bar: Quick/Full is one sliding switch (drawn track, solid bolt/pen icons, SMIL slide stamped per click).
- Compact (cold and swamp bands) opens a one-line bar: ✦ Compact, Summary (optional) field, drawn Compact pill with
  Claude's Enter mark; the note goes to `/compact <note>`. The field's own submit hint is clipped (window anchored
  right). Opening it fades the swamp green out over the violet, plus the entrance sweep.
- Settings: Appearance (was Show) has Uninstall (bin, red on hover, two presses). Panel keeps one height in every part.
- Effort: a message typed mid-turn never lowers the running turn's effort (held until the turn ends); Auto off/on
  mid-turn changes nothing.
- Startup: session.start reads its settings in one batch (25 ms). The ~3 s before the first draw is the app's; an
  empty chat is never asked for the band (app side, not fixable in the mod).
- Per-chat render log `~/.claude/effortless-render-<chat>.log`: session start, first-draw timing, draw times.

## Not done / unverified in the app
- Compact bar layout + fade (1.35.102-103), Quick/Full solid icons and per-click slide (1.35.101): rig only.
- Open question: after Auto off, later turns keep Auto's last effort rather than the app's own setting. Isac to decide.
- Logo animation on effort change / Auto on: proposed, not built.

## Next
1. Agent panel: a background agent is writing `docs/agent-panel/` (PLAN.md + mockups) for a right-side project
   overview pane that shows subagents and picks their model and effort. Review it with Isac before building.
2. Isac checks the Compact bar and the Quick/Full switch; fix what he reports in the rig first.

## Decided, do not redo
- No `clipPath` in band Svgs. No short-tick redraws; animate inside images (`inPhase`, SMIL).
- Controls over the art need an empty absolute child; each hoverable control in its own small box (shared boxes
  light up together). Buttons are one line and text only: draw icons/pills as Svg with a blank button over them.
- Svg needs alt text and a sized box, or the app may draw nothing.

## Pointers
- Render rig `tools/render-band/` (README): `--press`, `--command`, `--tree file.json`, `--trace MS`, `--at`, `--wait`,
  `--serve`. Dump a tree from a test with `console.log(JSON.stringify(await band.drawn()))` to render states the rig
  cannot reach.
- Tests `tests/effortless.test.ts`. Showcase brief `docs/showcase/`. Memories (ai-setup): `mod_band_styling.md`,
  `modellval_mod.md`, `mod_engine_module_rules.md`.
