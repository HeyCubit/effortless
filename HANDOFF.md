# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.35.62, pushed and installed. Direct pushes, no open PRs. Several chats push
  to main: `git pull --rebase --autostash` before every push, and read the version after the pull.
- Release: bump `version` in `.claude-plugin/plugin.json` and this file, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude
  plugin test .` (145 pass), commit, push, `claude plugin marketplace update effortless`, `claude plugin update
  effortless@effortless`. Isac restarts the app to load it. Use `py`, not `python`.
- Showcase site: https://heycubit.github.io/effortless/ (`gh-pages` = `main:site`).

## Where things stand (desktop band, 1.35.4x-1.35.61)
- Dashboard: effort word, ring, cache clock (self-ticking image, redraw once a minute), judge line in the middle,
  Auto switch + Handoff + settings cog right. Auto on: thin violet edge line fades in and out (no glow on off).
- Settings open on four cards (Effort, Judge, Handoff, Show) with summaries; a card opens its controls with Back and
  one line on what it does. Save in the top bar. Judge card has Test (confirmed working in the app with Jev).
- Handoff: setting reads "Handoff skill", default "effortless (built in)". Full without a skill submits
  `HANDOFF_FULL_PROMPT` as a turn (checks git, rewrites HANDOFF.md in the project, replies). New chat & archive removed.
- Redraws: every redraw rebuilds the band (images restart, hover drops, clicks can be lost). Animated images go
  through `inPhase()`; a click causes one redraw. Real redraws are logged to `~/.claude/effortless-renders.log`.

## Not done / unverified in the app
- 1.35.61, rig only: Handoff drawn as a pill that gains its box a step per percent (none at 0, grey at 15, white at
  30 where the glow starts, `handoffLook`), H on a clipped hidden button; effort change animates as an image (`effortWordSvg`: rises in
  violet, fades to white, one redraw at the end); drawn Back button; mark replaces the ✦.
- Settings cards and built-in Full handoff (1.35.59): rig and tests only. Cards light whole on hover (1.35.60), two blank buttons cover both lines.
- Auto line corners (1.35.58), no flash after Handoff (1.35.54).
- Open question to Isac: should built-in Full write HANDOFF.md into users' projects, or only reply?
- Older: cold band on resume, Compact complete card, terminal bands on CLI 2.1.285.
- Idea parked: one bar that changes state (cold, swamp) with transitions instead of separate bands.

## Next
1. Isac restarts and checks the settings cards, then a Full handoff without a skill. Fix what he reports, check it in
   the rig first: `node tools/render-band/render.mjs --press dash-settings,settings-card-judge`.
2. If he answers the HANDOFF.md question, adjust `HANDOFF_FULL_PROMPT` in `hooks/register.tsx`.

## Decided, do not redo
- No `clipPath` in band Svgs (invisible in the app). No short-tick redraws; step animations inside images.
- Glow only on Auto on, thin line, radius 8.25 inside the 10 px band border.
- Settings star 140 px. Cards over rows (first look was overwhelming). Built-in default handoff, not a third-party skill.

## Pointers
- Render rig `tools/render-band/` (README): `--press`, `--trace MS` (replays every redraw after a click as frames),
  `--at`, `--wait`, `--command`. Output in `tools/render-band/out/` (gitignored).
- Tests `tests/effortless.test.ts`. Memories (ai-setup): `mod_band_styling.md`, `modellval_mod.md`,
  `mod_engine_module_rules.md`.
