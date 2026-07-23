#!/usr/bin/env bash
#
# PostToolUse hook: formats a file with Prettier right after Claude Code writes
# or edits it, so formatting never has to be fixed up later (or caught by CI).
#
# It runs the workspace's pinned Prettier with `--ignore-unknown`, so it is a
# no-op on files Prettier can't format and it honors .prettierignore — meaning
# it is safe to run on every write regardless of file type.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# The hook payload arrives as JSON on stdin; the edited path is tool_input.file_path.
FILE_PATH="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String((j.tool_input&&j.tool_input.file_path)||""))}catch{process.stdout.write("")}})' 2>/dev/null || true)"

# Nothing to do without a real, existing file.
[ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ] || exit 0

# Only format files inside the repo (skip scratchpad/other locations).
ABS_FILE="$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd)/$(basename "$FILE_PATH")" || exit 0
case "$ABS_FILE" in
  "$ROOT"/*) ;;
  *) exit 0 ;;
esac

# Use the workspace Prettier if dependencies are installed; otherwise skip.
PRETTIER="$ROOT/node_modules/.bin/prettier"
[ -x "$PRETTIER" ] || exit 0

# Never fail the tool call over formatting.
"$PRETTIER" --ignore-unknown --write "$ABS_FILE" >/dev/null 2>&1 || true
exit 0
