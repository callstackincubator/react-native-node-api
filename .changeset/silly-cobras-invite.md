---
"cmake-rn": minor
---

Add a `--code-signing-allowed` flag to `cmake-rn`. `CODE_SIGNING_ALLOWED=NO` remains the default (needed for the free-standing dynamic libraries we produce), but a consumer who needs signed binaries in the XCFramework can now pass `--code-signing-allowed` to opt in.
