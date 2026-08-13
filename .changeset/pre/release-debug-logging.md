---
"react-native-node-api": patch
---

Stop emitting `log_debug`'s per-addon diagnostic chatter (library
found/loaded, symbol resolution, ...) in release builds. It is now compiled
out in `NDEBUG` builds (CMake's `Release`/`MinSizeRel`/`RelWithDebInfo`
configurations, and Xcode's default `Release` configuration), mirroring React
Native's own dev/release logging split. `log_warning` and `log_error` are
unaffected and keep firing in every build type.
