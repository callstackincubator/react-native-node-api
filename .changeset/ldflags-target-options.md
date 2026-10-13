---
"gyp-to-cmake": minor
---

Translate target-level `ldflags` from `binding.gyp` into private CMake link
options. The parser now validates that `ldflags` is an array of strings, and
the generated options preserve command expansion and escaped spaces.
