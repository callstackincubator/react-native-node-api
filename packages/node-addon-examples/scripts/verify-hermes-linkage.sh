#!/usr/bin/env bash
# Verifies an addon built with `--node-api-linkage hermes` links Hermes
# directly and that every Node-API function it imports is exported by the real
# Hermes library. Optionally reports stub exports the real library lacks.
#
# Usage: verify-hermes-linkage.sh <addon-binary> <hermes-binary> [<stub-binary>]
#
# On Linux, set LLVM_BIN to a directory with llvm-nm and llvm-readelf (e.g. the NDK's).
set -euo pipefail

addon=$1
hermes=$2
stub=${3:-}

if [[ "$(uname)" == "Darwin" ]]; then
  nm_cmd=(nm)
  dependencies() { otool -L "$1" | awk 'NR > 1 && !/:$/ { print $1 }'; }
else
  nm_cmd=("${LLVM_BIN:+$LLVM_BIN/}llvm-nm" -D)
  dependencies() {
    "${LLVM_BIN:+$LLVM_BIN/}llvm-readelf" -d "$1" | sed -n 's/.*Shared library: \[\(.*\)\]/\1/p'
  }
fi

# Mach-O prefixes C symbols with an underscore.
node_api_symbols() {
  "${nm_cmd[@]}" "$@" | awk '{ print $NF }' | sed 's/^_//' | { grep -E '^(napi|node_api)_' || true; } | sort -u
}
imported() { node_api_symbols --undefined-only "$1"; }
exported() { node_api_symbols --defined-only --extern-only "$1"; }

addon_dependencies=$(dependencies "$addon")
echo "Dependencies of $addon:"
echo "$addon_dependencies" | sed 's/^/  /'

if ! grep -q 'hermesvm' <<<"$addon_dependencies"; then
  echo "::error::Expected $addon to link hermesvm"
  exit 1
fi
if grep -q 'weak-node-api' <<<"$addon_dependencies"; then
  echo "::error::Expected $addon not to link weak-node-api"
  exit 1
fi

imports=$(imported "$addon")
if [[ -z "$imports" ]]; then
  echo "::error::Found no Node-API imports in $addon"
  exit 1
fi
missing=$(comm -23 <(echo "$imports") <(exported "$hermes"))
if [[ -n "$missing" ]]; then
  echo "::error::Hermes doesn't export Node-API functions imported by $addon: $(echo $missing)"
  exit 1
fi
echo "All $(echo "$imports" | wc -l | tr -d ' ') Node-API functions imported by the addon are exported by $hermes"

if [[ -n "$stub" ]]; then
  unexported=$(comm -23 <(exported "$stub") <(exported "$hermes"))
  if [[ -n "$unexported" ]]; then
    echo "::warning::The stub exports Node-API functions Hermes doesn't: $(echo $unexported)"
  else
    echo "Every Node-API function exported by the stub is exported by $hermes"
  fi
fi
