# effortless handoff

## Branch and PRs
- `main` on HeyCubit/effortless, direct pushes, no open PRs, no open issues. Several chats push to main: `git pull --rebase --autostash` first.
- History was rewritten on 2026-10-08 (every commit now authored by HeyCubit). Old clones and worktrees
  (`site-story`, `agent-panel`, `claude/competent-feistel-c1efc9`, `nervous-kapitsa`) must `git fetch` and reset onto
  the new branches before pushing, or the old commits come back. Commit as HeyCubit (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`
  = HeyCubit, heycubit@users.noreply.github.com). Never `gh pr merge`: it records Isac's personal account.
- Two channels. Users install from the `stable` branch (marketplace `ref: stable`, update card reads `public.json`).
  Isac runs the dev channel: `effortless@effortless-dev` (plugin from `main`, entries in `dev-releases.json`).
- `tools/release.sh --files <paths> -- "<subject>"`: tests, patch bump, commit, push, installs dev here. Never `--all`
  (other chats' changes sit in the tree). Reaches no user.
- `tools/publish.sh "<what's new>" "<detail>"`: minor bump, writes releases.json and public.json, moves `stable`, then
  runs `tools/site.sh`. Every user gets an update card. Only on Isac's word.
- Public: 1.64.0 (2026-10-08). Dev: 1.63.1.

## Website
- https://heycubit.github.io/effortless/ is `gh-pages`, rebuilt from `main`. Source `site/src/` (`template.html`,
  `report.html`, `whats-new.html`, `build.mjs`); built pages are committed. Publish with `tools/site.sh "<what changed>"`
  (builds, pushes main, fast-forwards gh-pages). Live: gh-pages `18872be`. Pages caches 10 minutes: hard refresh.
- Footer: "Also building [Cubit logo]" links to heycubit.com, next to a "Join the waitlist" pill
  (heycubit.com/waitlist/). Logo is `site/assets/cubit-logo-white.svg`, copied from the Cubit repo's `brand/`.
- Report a bug / Request a feature posts to a Cloudflare Worker, `report-worker/` (deployed as `effortless-report`,
  https://effortless-report.isac-ehrstedt.workers.dev), which files the issue in HeyCubit/effortless. Reporters need no
  account. Guards: origin check, 3 posts a minute per address (IPv6 by /64) and 20 overall, hidden field, 3 s minimum
  fill time, length limits, `@mentions` broken. Keeps nothing. If the worker fails, the page offers a prefilled GitHub link.
- The issues show IsacEhrstedt as opener: the secret `GITHUB_TOKEN` is Isac's own fine-grained token (owner HeyCubit,
  Issues read/write on this repo only). It expires; when it does the form falls back to the GitHub link until
  `cd report-worker && npx wrangler secret put GITHUB_TOKEN` is run with a new one. Deploy: `npx wrangler deploy` in
  `report-worker/`. Tests: `node --test report-worker/worker.test.mjs` (8). Local run: `.dev.vars` (ignored).
- Not on the site by choice: download or install stats (GitHub has no download count; unique cloners are 665 over
  14 days, API is owner-only). Add as a baked number at publish when it is larger.

## Half done
- Updated card redesign (1.48.4, public in 1.49.0): seen only in the render rig. The card is drawn by the code already
  running in that chat, so it first appears on the update after 1.49.0, in a chat running 1.49.0+.
- Haiku handoff recommendation, Compact beside Handoff (hidden under 80 cells), alert default 80%: public, unseen in the
  real app. Isac's dev config still has `swampAt: 60`.
- `effortless@effortless-panel` (1.45.9, agent-panel chat) is disabled in ~/.claude/settings.json, dev enabled. That
  chat has flipped it back before. Offered to uninstall the panel copy: no answer.
- An inline effortless copy has its own store without setup (`~/.claude/plugins/store/effortless_inline-*.json`).
- `tools/release.sh` has another chat's uncommitted edit; `docs/marketing/` untracked. Leave both.

## Next
1. In a fresh (non-remote) chat on the public version: check the band, Compact, Handoff advice, Settings.
2. Watch the first real report that arrives through the form; check the title, body and labels look right.
3. Optional: ruleset blocking force pushes on `stable` (offered, no answer).

## Only Isac
- Publishing to users, anything that force-pushes, anything with a login or a secret.
- Replacing the report worker's token when it expires. A GitHub App under HeyCubit would show reports as a bot
  instead of his name; offered, he chose his own token.
- Following up the GitHub Support ticket by mail (contributors sidebar still lists IsacEhrstedt).
- Uploading the social preview (`brand/social-preview.png`) and the HeyCubit avatar in repo settings (web login).
- Not answered: move HANDOFF/docs specs naming Isac out of the public repo; README screenshot shows old "Appearance".

## Decided, do not redo
- Deciding glow: rise, hold at full, fade 450 ms from the verdict, drawn as 150 ms pieces placed by clock. The app
  redraws the band every ~100-120 ms and sometimes re-shows an older copy ~0.6 s later; animations must survive a
  restart. Isac: "WORKS" on 1.36.18. Notes in ai-setup memory `mod_band_styling.md`.
- The judge line is off by default (`hide: reason`).
- Theme is one hue rotation, not a second colour set. Hot/Compact bands stay orange-red in both themes.
- No `clipPath` in band Svgs; controls over art need an empty absolute child; Svg needs alt text and a sized box.
- Split view: effortless only shows in the left pane (a Claude Code limitation); the site says so.

## Pointers
- Code `hooks/register.tsx` (bands, settings, judge), `hooks/theme.ts`, `hooks/agents.tsx`, `hooks/progress.tsx`.
- Tests: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test .` (`tests/effortless.test.ts`), 167 pass.
- Rig `tools/render-band/` (README); `--options theme=orange` renders the orange band.
- Render log `~/.claude/effortless-render-<chat>.log`. Agent panel plan `docs/agent-panel/`.
- Site checks: Jev manifests live in the session scratchpad, not the repo. The footer has no passing Jev check: its only
  click is a footer link that jumps to `#how`, which trips the story's clipped-control findings.
