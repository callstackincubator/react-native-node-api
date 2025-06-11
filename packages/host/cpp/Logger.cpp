#include "Logger.hpp"
#include <cstdarg>
#include <cstdio>

#if defined(__ANDROID__)
#include <android/log.h>
#define LOG_TAG "NodeApiHost"
#elif defined(__APPLE__)
#include <TargetConditionals.h>
#endif

namespace callstack::nodeapihost {
void log_debug(const char *format, ...) {
  // TODO: Disable logging in release builds

  va_list args;
  va_start(args, format);

#if defined(__ANDROID__)
  __android_log_vprint(ANDROID_LOG_DEBUG, LOG_TAG, format, args);
#elif defined(__APPLE__)
  // iOS or macOS
  fprintf(stderr, "[NodeApiHost] ");
  vfprintf(stderr, format, args);
  fprintf(stderr, "\n");
#else
  // Fallback for other platforms
  fprintf(stderr, "[NodeApiHost] ");
  vfprintf(stdout, format, args);
  fprintf(stdout, "\n");
#endif

  va_end(args);
}
} // namespace callstack::nodeapihost