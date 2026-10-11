---
"cmake-rn": patch
---

Apply `--code-signing-allowed` to CMake framework targets too. It was only
passed when building plain dynamic libraries, so framework targets built
through `xcodebuild archive`/`install` were always signed, leaving a
`_CodeSignature` directory in each framework.
