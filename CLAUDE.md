# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

The architecture overview, package layout, and coding patterns are shared with
other AI tools and documented once in the general instructions file below —
prefer editing that file over duplicating content here:

@.github/copilot-instructions.md

## Environment & bootstrap

On Claude Code on the web, the `SessionStart` hook
(`.claude/hooks/session-start.sh`) bootstraps the worker automatically, so a
fresh session is ready to build, lint and test the Node.js tooling packages. It:

1. Selects **Node.js 24** via `nvm` — `package.json`'s `devEngines` pins Node
   `^24` and npm `^11`, and npm refuses to install with an older runtime.
2. Runs `npm install` (workspace dependencies).
3. Runs `npm run build` (`tsc --build` across the TypeScript project references).

If you ever need to reproduce this by hand (e.g. after switching Node versions):

```bash
nvm use 24        # or otherwise ensure Node >= 24
npm install
npm run build
```

## Common commands

```bash
npm run build            # Incremental TypeScript build (tsc --build)
npm run lint             # ESLint over the repo
npm run prettier:check   # Formatting check (prettier:write to fix)
npm run depcheck         # Dependency usage check
npm test                 # Cross-package tests (host, cmake-rn, gyp-to-cmake, node-addon-examples)

# Focused iteration on a single workspace:
npm test --workspace cmake-rn
npm test --workspace gyp-to-cmake
```

## Native (iOS/Android) builds are not bootstrapped

`npm run bootstrap` (and the `bootstrap` scripts in `packages/weak-node-api` and
`packages/ferric-example`) compile native artifacts and require the **Android
NDK / Apple toolchains**, which are not present on a generic Linux worker.
Without them, `ferric build` produces "0 targets" and fails, and a full
`npm run lint` reports errors in `apps/test-app/App.tsx` because the generated
native binding types are missing.

Focus agent work on the Node.js tooling packages (`packages/cmake-rn`,
`packages/gyp-to-cmake`, `packages/cmake-file-api`, `packages/host`, etc.). When
you do need native builds, pass an explicit target, e.g. `npx ferric --apple` or
`npm run prebuild:build:android --workspace weak-node-api`, and ensure the
corresponding SDK/toolchain is installed first. Ask the maintainer to run
mobile-integration tests when they are needed.
