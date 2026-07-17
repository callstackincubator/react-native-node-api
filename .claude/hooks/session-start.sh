#!/usr/bin/env bash
#
# SessionStart hook: bootstraps the repo so a fresh Claude Code worker can build,
# lint and test the Node.js tooling packages out of the box.
#
# It ensures the Node.js version pinned in .nvmrc (which matches CI), installs
# the npm workspace dependencies and builds the TypeScript project references.
#
# Native iOS/Android artifacts are intentionally NOT built here: they require the
# Android NDK / Apple toolchains which are not present on a generic Linux worker.
# See CLAUDE.md for how to build those when you actually need them.
set -euo pipefail

# Only bootstrap in remote (Claude Code on the web) workers. Local machines
# usually already have their own Node setup, so we don't want to interfere.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# --- Ensure the Node.js version from .nvmrc via nvm ---------------------------
# .nvmrc pins the Node version (matching CI). package.json's devEngines requires
# Node ^24 / npm ^11, and npm refuses to install with an older runtime. nvm ships
# on the remote workers, so use it to install and select the pinned version.
NVM_DIR="${NVM_DIR:-/opt/nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  NVM_DIR="$HOME/.nvm"
fi

if [ -s "$NVM_DIR/nvm.sh" ]; then
  export NVM_DIR
  # nvm.sh dereferences unset variables, so relax `set -u` while it is active.
  set +u
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  # No version argument: nvm reads .nvmrc from the current directory.
  nvm install >/dev/null
  nvm use >/dev/null
  NODE_BIN="$(dirname "$(nvm which current)")"
  set -u

  export PATH="$NODE_BIN:$PATH"

  # Persist the resolved Node toolchain on PATH for the rest of the session.
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"$NODE_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
else
  echo "warning: nvm not found; using system Node $(node -v). package.json requires Node ^24." >&2
fi

echo "Using Node $(node -v) / npm $(npm -v)"

# --- Install dependencies and build the TypeScript packages -------------------
# `npm install` (not `ci`) so the resolved node_modules can be cached between
# sessions; it stays deterministic thanks to the committed package-lock.json.
npm install
npm run build

echo "Bootstrap complete: dependencies installed and TypeScript packages built."
