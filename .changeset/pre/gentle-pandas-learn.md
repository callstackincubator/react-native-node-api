---
"cmake-rn": minor
---

Let a consumer override the Android `ANDROID_STL` CMake cache variable via
the existing `-D`/`--define` option (e.g. `--define ANDROID_STL=c++_static`).
It still defaults to `c++_shared`, matching what React Native itself uses,
but an addon that must match a prebuilt third-party dependency's STL, or one
that's genuinely self-contained, can now ask for a different value.

This also fixes an ordering bug where a `--define` targeting any of the
Android platform's own default CMake variables (including `ANDROID_STL`) was
silently discarded: our hardcoded defaults were appended to the CMake
command line _after_ the user-provided `-D` arguments, and CMake resolves a
cache variable set multiple times via `-D` to its last occurrence.
