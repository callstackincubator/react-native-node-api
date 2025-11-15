#pragma once

#include <string>

namespace callstack::react_native_node_api {
void log_debug(const char *format, ...);
void log_warning(const char *format, ...);
void log_error(const char *format, ...);
} // namespace callstack::react_native_node_api
