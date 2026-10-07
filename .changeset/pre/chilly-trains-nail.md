---
"cmake-rn": minor
---

Add support for building projects declaring multiple shared object libraries into Node-API addons.

Each addon is emitted next to the sources it was built from, so that a project
declaring many addons produces the same layout as building each of them on its
own. Both the location and the name of an artifact are derived from the target
that produced it:

- `--out` supports a new `{targetSourceDir}` placeholder, expanding to the source
  directory of the target being emitted, and now defaults to
  `{targetSourceDir}/build/{configuration}`. This resolves to the same path as
  before, unless `--build` is pointed outside of the source directory.
- The artifact is named after the target's `OUTPUT_NAME` rather than the CMake
  target name. These are the same unless `OUTPUT_NAME` is set explicitly, which is
  how a project can give its targets the unique names CMake requires without
  affecting the name of the addon.

Also adds `--concurrency`, limiting how many build tasks run at once. It defaults
to the available parallelism, or to 1 when `--verbose` is enabled, since
interleaved output from concurrent builds is hard to read.
