---
"react-native-node-api": patch
---

Fix `prebuilt-hermes` failing to configure the host Hermes compiler. It passed
`CMAKE_OSX_ARCHITECTURES=arm64;x86_64` to build a universal `hermesc`, but a
multi-arch host configure makes llvh's feature try-compiles fail — standard
headers report as missing and the configure dies with "Host compiler appears to
require libatomic, but cannot find it". The host compiler is now configured the
way Hermes and React Native configure it, for the host architecture only.

`hermesc` is consequently native to the Mac that built the archive, so the
archive name now carries the host architecture. An Intel Mac finds no published
archive for its architecture and builds its own, rather than downloading one
whose `hermesc` it cannot execute.
