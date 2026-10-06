# modellval: handoff

## Branch and PRs

- `main` is the release. Users install with `claude plugin marketplace add Segueapp/modellval`.
- A release = bump `version` in `.claude-plugin/plugin.json`, push; users run `claude plugin update modellval@modellval`.

## Half done

- The footer's look (hover box, ⏻ without a frame, Compact) is checked by tests on the drawn tree, not on the app's pixels.
- A/B mode (Auto on/off at random per prompt, cost logged) is not built; it is the only way to prove a saving.

## Next

1. A/B mode.
2. Effort mid-task: raise after a tool error, lower for simple steps (`turn.step` fires per request).

## Only the owner

- Publishing releases, answering issues.

## Pointers

- Code: `hooks/register.tsx`. State contract: `types/index.d.ts`. Tests: `tests/modellval.test.ts` (`claude plugin test .`).
- Platform limits found: a mod cannot move the app's own Model/Effort buttons; the footer draws no Svg and no box
  border or background; a Button has no size, shape or colour prop; a timer must start in `session.start` (one started
  inside a request ends with it); the engine's "reloaded (N hooks)" line in hot-reload folders cannot be hidden.
