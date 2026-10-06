# Terminal audit, 2026-10-06

CLI 2.1.288 (`claude.exe` from the desktop app folder), driven in a pywinpty pty at 80, 100 and 120 columns and
read back with pyte. Harness: `tty.py` in that session's scratchpad (not committed). The Terminal panel tools could
not be used: the app's pwsh shell integration file `terminal-shell-integration\pwsh\claude-desktop.ps1` is missing,
so the panel never reports a prompt.

## Works
- Effort row above the prompt, with `[ Auto on ]` and the hint text.
- Line under each reply (`Worked 3s ✦ Low`, `· cache cold`).
- Cold, swamp, hot and judge-down bands draw as a rounded box with text and `[ button ]`s.
- Progress bar: step, ask (yellow) and done (green) states draw; clear removes it.
- Settings panel draws with all rows.

## Breaks
1. Text is cut hard at 80 columns: swamp `150k tokens re…`, cold `Comp…`, hot `re…`, judge-down `Ha…`. The effort
   row hint is cut at every width (`Picks the effort at the next pro`, `The app's control shows Med`).
2. A band replaces the effort row, so effort is hidden while a band shows.
3. Settings: the Show row runs past the box at 80 and 120 columns (`Running ho`, `● Pr`); two empty rows under the
   title.
4. Settings does not close on Esc, and while it is open `/effortless setup` says "open" but settings stays on top.
5. Progress bar has no visible track in the terminal, only text.
6. No band art in the terminal (the art box is empty), as expected.
7. Copy is desktop-specific: cold says "Compact is in the footer"; the effort hint says "The app's control shows".
8. The host draws its `[-]` collapse mark over the band's top-right corner.
9. After a reply that ended in an API error, `/effortless swamp` said the band was showing but no band drew
   (seen twice). Suspect `turnBusy` is not cleared when a turn ends in an API error; the 10 min stale guard would
   hide bands that long. Needs a test.

## Not checked
- Keyboard reach of band buttons: Up recalls prompt history, Tab does nothing visible. Mouse clicks not tried.
- Cards under replies (handoff, compact, warnings) and the handoff bar: every model turn failed with
  `401 OAuth access token has expired`, both with the app's env and a clean env. The standalone CLI login on this
  PC has expired; Isac has to run `/login` in a terminal `claude` once.
- Minimum CLI version for mods.
