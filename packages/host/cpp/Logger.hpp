#pragma once

#include <string>

namespace callstack::react_native_node_api {

// Inline (rather than a no-op in Logger.cpp) to let the optimizer drop the
// argument evaluation at every call site.
#ifdef NDEBUG
inline void log_debug(const char *, ...) {}
#else
void log_debug(const char *format, ...);
#endif

void log_warning(const char *format, ...);
void log_error(const char *format, ...);

} // namespace callstack::react_native_node_api
