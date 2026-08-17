---
"ferric-cli": minor
---

Add a `ferric init [path]` command, scaffolding a package building a Rust Node-API module.

It writes the `package.json`, `Cargo.toml`, `build.rs`, `src/lib.rs` and `.gitignore` a package needs, and adds it to the workspace of the mono-repo it is initialized into. Run against a package that already exists, it updates instead of overwriting: values already declared are kept, an existing `Cargo.toml` is left alone (with notices about anything it lacks) and `--dry-run` prints the changes without applying them.
