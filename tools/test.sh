#!/usr/bin/env bash
# Runs effortless's own tests. `claude plugin test .` runs every *.test.ts under the folder and has no exclude, so
# ignored folders (node_modules/, worktrees under .claude/) would be swept in. This runs them on a copy of the working
# tree: tracked files plus new ones not ignored, as they are on disk now.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d '' f; do
  [ -f "$f" ] && cp --parents -- "$f" "$tmp"
done
cd "$tmp"
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test .
