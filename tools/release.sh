#!/usr/bin/env bash
# Ships a release: tests, version bump, commit, push, local install. Stops at the first failure, a failing test included,
# so a broken build never reaches the marketplace. Usage: tools/release.sh "<commit subject>" ["<commit body>"]
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test . 2>&1) || true
if ! grep -q '^ 0 fail' <<<"$out"; then
  grep -E '^\s*[0-9]+ (pass|fail)|\(fail\)' <<<"$out" || echo "$out" | tail -20
  echo "release stopped: tests failed" >&2
  exit 1
fi
old=$(node -p "require('./.claude-plugin/plugin.json').version")
new=$(node -p "const v='$old'.split('.');v[2]=+v[2]+1;v.join('.')")
sed -i "s/\"version\": \"$old\"/\"version\": \"$new\"/" .claude-plugin/plugin.json
sed -i "s/version $old/version $new/" HANDOFF.md
git add -A hooks tests .claude-plugin/plugin.json HANDOFF.md
git commit -q -m "$1" -m "${2:-}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull -q --rebase --autostash
git push -q
claude plugin marketplace update effortless >/dev/null
claude plugin update effortless@effortless | tail -1
echo "released $new"
