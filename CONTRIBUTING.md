# Contributing

## Setup

You'll need Node.js 24 (pinned in [`.nvmrc`](.nvmrc)) and pnpm, which Corepack provides:

```bash
nvm install && nvm use
corepack enable
pnpm install
```

Then build, picking one of:

```bash
pnpm run build      # TypeScript only: enough for most work on the Node.js tooling
pnpm run bootstrap  # Also builds native artifacts: needs the Android NDK and/or Apple toolchains, and takes a while
```

Use `pnpm run dev` to rebuild TypeScript on change.

## Before opening a pull request

```bash
pnpm --filter weak-node-api run prebuild:prepare  # Generates sources that linting needs
pnpm run lint
pnpm run prettier:check
pnpm run depcheck
pnpm test
```

`pnpm test` needs a prior `pnpm run bootstrap`. While iterating, run a single package's tests instead, for example `pnpm --filter cmake-rn run test`.

If your change affects a published package, add a changeset with `pnpm changeset`.

## Pull requests

Some CI jobs only run when the pull request has a matching label (`Host 🏡`, `Apple 🍎`, `Android 🤖`, `MacOS 💻`, `Ferric 🦀` or `weak-node-api`). Labels added after a pull request is opened take effect on the next push.

Learn more about the project in the [README](README.md#packages) and in ["how it works"](docs/HOW-IT-WORKS.md).
