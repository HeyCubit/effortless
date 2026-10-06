# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, version 1.35.10, pushed and installed. Direct pushes, no open PRs. Several chats push
  to main: fetch and rebase before every push, and read the version after the pull (others bump it too).
- Release: bump `version` in `.claude-plugin/plugin.json`, `<cli> plugin validate .`, `<cli> plugin test .`
  (0 fail, 139 tests), push, `<cli> plugin marketplace update effortless`, `<cli> plugin update effortless@effortless`.
- CLI on this PC: `$APPDATA/Claude/claude-code/<version>/<hash>/claude.exe` (newest folder). The agent sandbox sees a
  virtualised AppData, so Isac uses plain `claude`.
- Showcase site: live at https://heycubit.github.io/effortless/ (`gh-pages` = `main:site`). Social preview upload and
  untracked `docs/brand/` wait for Isac. Design notes: ai-setup `memory/effortless/site-design.md`.

## Where things stand
- Dashboard (1.35.x, spec `docs/superpowers/specs/2026-10-06-dashboard-design.md`): setting **Look** = Dashboard
  (default) or Minimal (old footer buttons). Dashboard is a grey band above the prompt, one row: `✦ <level|Off>`,
  cache, context ring + %, then dim judge reason and last reply cost (weighted tokens, time). Buttons: grey Auto,
  white Handoff (H), Settings (word). Alerts, bars and panels take its slot while they show. Purple is kept for those.
- Terminal: alert bands with moving half-block pixel art (`hooks/art.ts`), dashboard uses grey `calm` art, effort
  row under bands. Terminal CLI needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (set in Isac's settings; README says so).
- Fixes today: settings saved to the mod's store when the app has no /config row (friend's error); old chats seed the
  cache countdown from `classic.SessionStart` (resume); Full with no skill shows "Pick a skill"; a Full handoff now
  tells the new chat to read what the skill saved (`handoffMessage(..., skill)`).

## Not done / unverified
- Full handoff fix (1.35.10) not yet seen in the app: the new chat should open by reading HANDOFF.md.
- Resume cold-band fix not seen in the app (does the desktop send `seconds_since_last_response` on resume?).
- Terminal on CLI 2.1.285: mod still did not load with the env var (proven only on 2.1.286). Band hotkeys
  (ctrl+x tab, then the letter) unproven.
- Desktop not seen: Compact complete card, progress sounds in a real task.

## Next
1. Check this handoff landed: the new chat read HANDOFF.md first (Isac ran Full + Clear & carry on).
2. Isac opens an old chat: cold band should show. If not, `/effortless debug` and look for classic.SessionStart.
3. Terminal 2.1.285: run `claude --debug`, read `~/.claude/debug/<id>.txt` for "hooks module effortless".

## Decided, do not redo
- Dashboard grey; only ✦ in accent. No outline box around Auto (it grew the row). No hotkey letters on grey buttons
  (the app draws them faint). No "saved tokens" figure (no honest baseline).
- Fewer choices: judge stays a choice; alerts and the reply line always show; `HIDEABLE` = handoff, timer, progress,
  sounds. Setup 3 steps. Terminal art = `Raster` (Image is alt-only on Windows Terminal).
- Swamp only as a band. Compact uses the handoff card. Auto pauses on Fable/older Opus. Split view: left pane only.

## Pointers
- Tests `tests/effortless.test.ts` (legacy tests run in Minimal via a `test` wrapper; dashboard tests pass
  `{ layout: 'default' }`). Terminal audit `docs/terminal-audit-2026-10-06.md`.
- Pty harness for real-CLI checks: pywinpty + pyte, set `MSYS_NO_PATHCONV=1` in Git Bash (not in repo).
- Memories: `modellval_mod.md`, `mod_band_styling.md`, `mod_engine_module_rules.md`.
