# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.6.3. Direct pushes, no open PRs.
- Release: bump `version` in `.claude-plugin/plugin.json`, push, then
  `claude plugin marketplace update effortless` and `claude plugin update effortless@effortless`, restart.

## Half done
- Setup band still uses the old in-flow layout (fixed 360px decoration). The cold band's
  backdrop recipe (absolute Svg layer sliced larger than the band, buttons in a later
  absolute layer) has not been applied to it yet.
- Model Auto stays paused (EFFORTLESS_MODEL_UI=1 brings the row back).

## Next
- Apply the cold-band layout to the setup band.
- Rerun `/effortless bench` after any judge-prompt change; report the held-out line.
- Free savings estimate: compare logged per-prompt cost against an always-high baseline after a week of use.

## Only Isac
- Visual sign-off in the desktop app (tests cannot see what it draws).
- A separate GitHub account if full anonymity is wanted (pusher shows in the repo events API).

## Pointers
- Judge benchmark: `bench/judge-cases.json` (73 cases, 20 held out), README "How often the judge is right".
- Band styling recipe and gotchas: memory `mod_band_styling.md`.
- Mod state: memory `modellval_mod.md`.
