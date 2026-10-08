# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, direct pushes, no open PRs. Several chats push to main: `git pull --rebase --autostash` first.
- History was rewritten on 2026-10-08 (every commit now authored by HeyCubit). Old clones and worktrees
  (`site-story`, `agent-panel`, `claude/competent-feistel-c1efc9`, `nervous-kapitsa`) must `git fetch` and reset onto
  the new branches before pushing, or the old commits come back.
- Two channels. Users install from the `stable` branch (marketplace `ref: stable`, update card reads `public.json`).
  Isac runs the dev channel: `effortless@effortless-dev` (plugin from `main`, entries in `dev-releases.json`).
- `tools/release.sh --files <paths> -- "<subject>"`: tests, patch bump, commit, push, installs dev here. Never `--all`
  (other chats' changes sit in the tree). Reaches no user.
- `tools/publish.sh "<what's new>" "<detail>"`: minor bump, writes releases.json and public.json, moves `stable`.
  Every user gets an update card. Only on Isac's word.
- Public: 1.49.0 (2026-10-08). Dev: 1.49.0. `tools/publish.sh` also rebuilds the site and pushes gh-pages (`tools/site.sh`). Site: https://heycubit.github.io/effortless/ (`gh-pages`, rebuilt from `main`).

## Half done
- Updated card redesign (1.48.4, public in 1.49.0): near black, dim green edge, one row with What's new, Share
  (copies site link), Star on GitHub, ✕. Seen only in the render rig. Updating to 1.49.0 still showed the OLD green
  card, because the card is drawn by the code already running in that chat (a remote chat cannot /reload-plugins).
  The new card first appears on the update after 1.49.0, in a chat running 1.49.0+.
- Haiku handoff recommendation, Compact button beside Handoff (hidden under 80 cells), alert default 80%: public
  1.49.0, unseen in the real app. Isac's dev config still has `swampAt: 60`.
- `effortless@effortless-panel` (1.45.9, owned by the agent-panel chat) is disabled in ~/.claude/settings.json and dev
  enabled. That chat has flipped it back before. Offered to uninstall the panel copy: no answer.
- An inline effortless copy has its own store without setup (`~/.claude/plugins/store/effortless_inline-*.json`).
- Not answered: move HANDOFF/docs specs naming Isac out of the public repo; README screenshot shows old "Appearance";
  HeyCubit avatar and social preview (web settings). Uninstall test result never reported.
- `tools/release.sh` has another chat's uncommitted edit; `docs/marketing/` untracked. Leave both.

## Next
1. In a fresh (non-remote) chat on 1.49.0: check the band, Compact, Handoff advice, Settings.
2. To see the new Updated card: release any dev bump, update, look. Fix what Isac reports.
3. Optional: ruleset blocking force pushes on `stable` (offered, no answer).

## Only Isac
- Publishing to users, anything that force-pushes.
- Following up the GitHub Support ticket by mail (contributors sidebar still lists IsacEhrstedt).

## Decided, do not redo
- Deciding glow: rise, hold at full, fade 450 ms from the verdict, drawn as 150 ms pieces placed by clock. The app
  redraws the band every ~100-120 ms and sometimes re-shows an older copy ~0.6 s later; animations must survive a
  restart. Isac: "WORKS" on 1.36.18. Notes in ai-setup memory `mod_band_styling.md`.
- The judge line is off by default (`hide: reason`).
- Theme is one hue rotation, not a second colour set. Hot/Compact bands stay orange-red in both themes.
- No `clipPath` in band Svgs; controls over art need an empty absolute child; Svg needs alt text and a sized box.

## Pointers
- Code `hooks/register.tsx` (bands, settings, judge), `hooks/theme.ts`, `hooks/agents.tsx`, `hooks/progress.tsx`.
- Tests: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test .` (`tests/effortless.test.ts`).
- Rig `tools/render-band/` (README); `--options theme=orange` renders the orange band.
- Render log `~/.claude/effortless-render-<chat>.log`. Agent panel plan `docs/agent-panel/`.
