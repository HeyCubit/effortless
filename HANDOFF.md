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
- Public: 1.37.0. Dev: 1.37.2. Site: https://heycubit.github.io/effortless/ (`gh-pages`, rebuilt from `main`).

## Half done
- Theme (1.37.2, dev): Settings → Appearance → Theme, Violet (default) or Claude orange. `hooks/theme.ts` turns every
  violet hex to hue 15 (accent `#a79cf7` → `#da7958`); Svg sources go through `themedEls`, text colours through
  `accent()`/`tintHex`, art palette in `hooks/art.ts`, progress/agents looks via `looks()`. Tests pass (161) and the
  rig renders the band orange. Not seen yet: the Settings panel itself (the rig cannot draw it) and the real app.
- 1.37.1 (Check for updates button in Settings) and 1.37.2 are dev only, not published.
- GitHub contributors sidebar still lists IsacEhrstedt (server cache; API already shows only HeyCubit). Support
  ticket sent 2026-10-08. Isac does not want to post the repo anywhere until it is gone.
- Uninstall test (Settings → Appearance → Uninstall, two presses): result never reported.

## Next
1. Isac: `/reload-plugins`, Settings → Appearance → Theme → Claude orange; check panel, band, footer, banners.
2. Fix what he reports, then ask whether to publish (1.38.0 would carry the update button and the theme).
3. Optional: block force pushes and deletion on `stable` with a ruleset (offered, no answer yet).
4. Marketing research ran in its own chat: `docs/marketing/launch-research.md` (untracked, not committed by this chat).

## Only Isac
- Publishing to users, anything that force-pushes (the safety check blocks Claude; he ran the rewrite in Git Bash).
- Following up the GitHub Support ticket by mail.

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
