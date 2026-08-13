---
"react-native-node-api": patch
---

Fix `prebuilt-hermes` failing to configure the host Hermes compiler with "Host
compiler appears to require libatomic, but cannot find it". It exported all
three deployment targets Hermes' `build-apple-framework.sh` can ask for to every
command it ran, including the host compiler build. `XROS_DEPLOYMENT_TARGET` is
also a clang driver variable, so clang targeted visionOS against the macOS
sysroot, and every API marked unavailable there — `pthread_mutexattr_init`, the
`fd_set` helpers reached through `unistd.h` — failed to compile. Each platform
build now gets only the deployment target it needs, and the host compiler build
gets none.
