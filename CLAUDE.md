# CLAUDE.md

Guidance for Claude Code working in this repository.

The architecture overview, package layout, coding patterns, and
environment/bootstrap notes are shared with other AI tools and live in the
top-level, tool-agnostic instructions file — prefer editing that over
duplicating content here:

@AGENTS.md

## Claude Code on the web

A `SessionStart` hook (`.claude/hooks/session-start.sh`) bootstraps remote
workers automatically: it selects the Node.js version pinned in `.nvmrc` via
`nvm` (Node 24, as required by `package.json`'s `devEngines`) and pnpm via
Corepack, then runs `pnpm install` and `pnpm run build`, so a fresh session is
ready to build, lint, and test the Node.js tooling packages.

See the "Environment & Bootstrap" section of `AGENTS.md` for the manual steps and
for why native iOS/Android builds are not part of the default bootstrap.

## Formatting

A `PostToolUse` hook (`.claude/hooks/format-file.sh`) runs the workspace's
Prettier on every file Claude Code writes or edits inside the repo. It uses
`--ignore-unknown`, so it is a no-op on files Prettier can't format and it honors
`.prettierignore` — keeping the tree formatted without a separate `prettier:write`
pass. It's a convenience only; CI's `prettier:check` remains the source of truth.
