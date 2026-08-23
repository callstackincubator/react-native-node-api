---
"gyp-to-cmake": minor
---

Translate target-level `cflags` from `binding.gyp` into private CMake compile
options. The parser now validates that `cflags` is an array of strings, and the
generated options preserve command expansion and escaped spaces.
