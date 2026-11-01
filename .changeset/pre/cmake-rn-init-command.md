---
"cmake-rn": minor
---

Add a `cmake-rn init [path]` command, scaffolding a package building a CMake Node-API module.

It writes the `package.json`, `CMakeLists.txt`, `src/addon.c`, a JavaScript entrypoint with its TypeScript declarations and `.gitignore` a package needs, and adds it to the workspace of the mono-repo it is initialized into. Run against a package that already exists, it bumps outdated dependencies, and inspects an existing `CMakeLists.txt` instead of replacing it, pointing out when it doesn't define or link the `weak-node-api` target. `--weak-node-api <link|cmake-js|omit>` picks how a new `CMakeLists.txt` gets Node-API: linking the `weak-node-api` target (the default), through the cmake-js variables so it also builds with cmake-js, or not at all. A differing entrypoint or source file is skipped with a diff to merge by hand, unless `--force` is passed. `--dry-run` prints all of this without writing anything.

The build is now the default `build` subcommand, so `cmake-rn` invocations keep working as before, and its options are listed by `cmake-rn build --help`.
