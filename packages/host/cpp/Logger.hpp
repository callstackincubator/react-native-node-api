#pragma once

#include <string>

namespace callstack::nodeapihost {
void log_debug(const char* format, ...);
void log_warning(const char* format, ...);
void log_error(const char* format, ...);
}  // namespace callstack::nodeapihost
