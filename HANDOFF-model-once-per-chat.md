# Handoff: pick the model once per chat, at the first Enter where nothing else can run

## Goal

With `modelAuto` set to `once`, the judge reads the chat's first prompt and picks the chat's model, any model, no cap. The model is switched for real. A stronger pick asks the person first; declined, the chat stays on its model one effort level up.

## Source and where it is installed

- Repository: https://github.com/Ar1ssi/effortless, branch `model-once-per-chat`, head 2f1b234 ("Model: pick once per chat").
- Working copy with the uncommitted changes: `C:\Users\SMG26\src\effortless` (six files changed, see below). Nothing is committed or pushed.
- Installed copy, loaded by the desktop app and the CLI alike: `C:\Users\SMG26\.claude\plugins\cache\effortless-fork\effortless\1.71.0\`, installed as `effortless@effortless-fork` from the local marketplace `~/.claude/plugins/effortless-fork-marketplace`, which pins the GitHub branch. The changed files were copied over it by hand. `claude plugin update` reinstalls from the GitHub branch and loses them until they are pushed.
- Engines already running keep the old code until their chat is reopened (the `.in_use/` markers). New chats load the new code.

## What was found

- The desktop app starts a chat's engine only at the first Enter, as an SDK host: `claude.exe --output-format stream-json --input-format stream-json --model=... --effort=... --permission-prompt-tool=stdio`, the prompt queued about 200 ms after `session.start`. No plugin code can run while the first message of a fresh desktop chat is typed. The draft watch (judge while typing) only works where an engine already runs: the terminal, or a chat after `/clear`. The prompt's `origin.kind` is `sdk`; `session.start` sees `surface: null`.
- Inside `prompt.submit`, `$.command.run` is refused, also from a `$.clock.after` scheduled there ("called from a prompt.submit hook, it would wait on the turn this hook is holding; run it from a later event (turn.complete)"). A command queued from a session.start-born timer while a prompt is held never answers and delays the turn by about 25 s.
- `$.command.run({ command: 'model' })` from `turn.complete` works (12 ms).
- `$.ui.ask` works while `prompt.submit` holds: it reaches the host as a `can_use_tool` AskUserQuestion request, before the `init` message, and the hook's 10 s budget does not run while it waits.
- `turn.step` accepts `next({ ...e, model })` per request; the plugin's `routed` path already does this.

## What changed

- `hooks/register.tsx`, `prompt.submit`: in a chat not yet locked, with `modelAuto` `once`, the prompt's own verdict settles the chat (`pickAtSubmit`). A cheaper pick sets `routed` so the first turn goes to the picked model, and books `pendingSwitch`. A stronger pick asks through `$.ui.ask` (`askMoveUpAtSubmit`): "Move up to X" or "Stay on Y, raise effort"; no, dismissed, or nobody to ask keeps the chat on its model at one effort level up.
- `turn.complete` (main thread): runs `pendingSwitch` through `switchModel` (`/model`), then clears `routed`. Refused, the chat's requests keep going to the pick by routing.
- The draft watch stays for engines already running. When Enter comes while it is still judging or asking, it stops short (`submitTakeover`) and keeps its verdict in `scanned` for the prompt's hook, which settles the chat. The prompt's hook waits for a running scan through `$.clock.now()` calls (budget-free), at most 8 s, and never while the scan runs its switch (`settling`).
- `lockChatModel($, to, route)`: `chatPick` is the pick kept in the store per chat; `routed` is where requests go meanwhile. After a real switch `routed` is null.
- `session.start`: a chat opened again with a kept pick is put back on it from a timer (the desktop relaunches a chat on its own picker's model); until then, and if refused, its requests are routed there.
- `/clear` resets `chatPick`, `pendingSwitch`, `submitTakeover` too.
- `/effortless debug`: the `model:` entry says `picked X (the switch lands when the turn ends)` or `(routed)`.
- `types/index.d.ts`: `updateCheck: string` declared (it was missing; `claude plugin validate` failed on the installed copy before).
- `.claude-plugin/plugin.json` and `README.md` describe the new behaviour. `tests/effortless.test.ts`: three tests added for the Enter-time pick (cheaper, move up declined, move up accepted).

## Verified

- `claude plugin validate`: passes. `claude plugin test`: 204 pass, 2 fail; the two failures exist on 2f1b234 as well ("if the clipboard refuses, the handoff goes in the prompt box" and "Auto switched off ... turns Off in white").
- End to end on the desktop's own engine binary (2.1.293, stream-json, driver in `%LOCALAPPDATA%\Temp\effortless-probe-driver\drive.py`, proof log via `EFFORTLESS_LOG`):
  - Opus chat, "Reply with the single word pong.": judged haiku/low, request 0 sent to Haiku, answer from Haiku, then "this chat is on haiku for real now (switched after its first turn)".
  - Haiku chat, hard prompt: the AskUserQuestion request arrived with "Move up to Opus" / "Stay on Haiku, raise effort"; answered yes, request 0 sent to Opus at high, then switched for real.

## Not verified

- The desktop app's drawing of the question card when it arrives before `init` (the app's `Query.processControlRequest` has no init gate, so it should draw). One test in the app: new chat on Haiku, a hard prompt. If the card does not show, the fallback is to ask during the first turn instead of holding the prompt.
- A terminal chat: the draft watch band while typing, and the dialog at Enter when typing was quicker than the watch.
- `tsc` over the repo reports many pre-existing errors in other files; the patched regions add none (the two `modelScan` TS2769 errors were fixed with `as const` on the stage literals).
- The "no" path of the move-up question in the desktop app (expect: the chat stays on its model, effort one level up, and a toast that says so). Unit-tested only.

## Seen in the desktop app (2026-10-14)

- Engine 2.1.295, new chat on Opus, prompt "Audit the generation 5 cards.": the judge said opus/medium, the chat was locked to its own model (`chatModel:<sid> = "own"` in the store), every request ran on `claude-opus-5-5`, and the band showed Medium. Correct, but nothing visible said a pick had happened, so a toast was added for the stay case too (`effortless: this chat stays on Opus (picked from your first prompt)`). The draft-watch toast now names the model as well.

## Next

- Commit and push the working copy to `model-once-per-chat`, then `claude plugin update effortless@effortless-fork`, so an update does not lose the change.
- `commands/effortless.md` is only the not-loaded fallback text; it has nothing to update.
