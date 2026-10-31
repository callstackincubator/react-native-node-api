---
"ferric-cli": minor
---

Add a `ferric init [path]` command, scaffolding a package building a Rust Node-API module.

It writes the `package.json`, `Cargo.toml`, `build.rs`, `src/lib.rs` and `.gitignore` a package needs, and adds it to the workspace of the mono-repo it is initialized into. Run against a package that already exists, it bumps outdated dependencies and crates in place, and prints a diff for every update. A differing entrypoint or source file is skipped with a diff to merge by hand, unless `--force` is passed. `--dry-run` prints all of this without writing anything.

A new `Cargo.toml` enables Node-API version 10 by default, and can be configured with `--node-api-version`, `--napi-crate-version`, `--napi-derive-crate-version`, `--napi-build-crate-version` and `--release-profile`.
