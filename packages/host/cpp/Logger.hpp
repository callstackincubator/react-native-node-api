#pragma once

#include <string>

namespace callstack::react_native_node_api {

// log_debug is verbose, per-addon diagnostic chatter (library found/loaded,
// symbol resolution, ...) emitted on every addon load. It is compiled out
// entirely in release builds: NDEBUG is what CMake's Release/MinSizeRel/
// RelWithDebInfo configurations define (and what Xcode's Release
// configuration defines by default), mirroring the dev/release split React
// Native itself draws with `__DEV__`. Making the release build's log_debug an
// inline no-op - rather than compiling Logger.cpp's definition and letting it
// run - drops both the log line and its argument-formatting cost from the
// startup path, and lets the optimizer elide side-effect-free call sites
// entirely.
//
// This is compile-time only: there is currently no runtime override to
// re-enable it in a shipped release build to chase a release-only bug (there
// is no existing mechanism in this codebase - env var, JS-settable flag, etc.
// - to hook one into without adding new plumbing of its own). Build a
// Debug or RelWithDebInfo artifact to get this output back; revisit with a
// runtime toggle if that turns out to be too painful in practice.
#ifdef NDEBUG
inline void log_debug(const char *, ...) {}
#else
void log_debug(const char *format, ...);
#endif

// log_warning/log_error keep firing unconditionally in every build type,
// including release (NDEBUG) ones.
void log_warning(const char *format, ...);
void log_error(const char *format, ...);

} // namespace callstack::react_native_node_api
