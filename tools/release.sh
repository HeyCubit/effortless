#!/usr/bin/env bash
# Ships a release: tests, version bump, commit, push, local install. Stops at the first failure, a failing test included,
# so a broken build never reaches the marketplace. Usage: tools/release.sh [--no-install] "<commit subject>" ["<commit body>"]
# --no-install pushes without updating this machine's copy, so the mod's update card can be tried here.
set -euo pipefail
install=1
if [ "${1:-}" = "--no-install" ]; then install=0; shift; fi
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
# The mod's update card reads the newest entry: the version, the day and the commit's subject as the note.
node -e '
const fs = require("fs"), [v, note] = process.argv.slice(1)
const list = fs.existsSync("releases.json") ? JSON.parse(fs.readFileSync("releases.json", "utf8")) : []
list.unshift({ version: v, date: new Date().toISOString().slice(0, 10), note })
fs.writeFileSync("releases.json", JSON.stringify(list, null, 2) + String.fromCharCode(10))' "$new" "$1"
git add -A hooks tests types tools .claude-plugin/plugin.json HANDOFF.md releases.json
git commit -q -m "$1" -m "${2:-}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull -q --rebase --autostash
git push -q
if [ "$install" = 1 ]; then
  claude plugin marketplace update effortless >/dev/null
  claude plugin update effortless@effortless | tail -1
fi
echo "released $new"
