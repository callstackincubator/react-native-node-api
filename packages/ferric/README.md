# `ferric`

A wrapper around Cargo making it easier to produce prebuilt binaries targeting iOS and Android matching [the prebuilt binary specification](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/PREBUILDS.md) as well as [napi.rs](https://napi.rs/) to generate bindings from annotated Rust code.

## `ferric init [path]`

Scaffold a package building a Rust Node-API module, or bring an existing package
up to what `ferric build` expects of it:

```
npx ferric init packages/my-addon
```

The command creates whatever is missing — `package.json`, `Cargo.toml`,
`build.rs`, `src/lib.rs` and `.gitignore` — and adds the package to the
`pnpm-workspace.yaml` or `"workspaces"` of the mono-repo it is initialized into.

Running it against a package which already exists updates rather than overwrites:
values already declared are left alone, so an existing `package.json` only gains
the scripts, dependencies and prebuilt artifacts it lacks. An existing
`Cargo.toml` is never rewritten — pinned versions, features and comments are
worth more than a mechanical update — but the command points out anything it
needs to build as a Node-API module.

The name of the crate defaults to the package name without its npm scope
(`@my-org/my-addon` becomes `my-addon`) and can be set with `--name`. Cargo
normalizes it to `my_addon` for the artifacts it produces, which is the basename
`ferric build` writes its outputs and entrypoint with.

Every file it updates is printed as a diff, and `--dry-run` prints the whole
plan without writing anything:

```
npx ferric init packages/my-addon --dry-run
```

The [`ferric-example`](../ferric-example) package is what an initialized package
grows into: running `ferric init` in it is expected to be a no-op, which the
tests assert.
