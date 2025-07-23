#include "Logger.hpp"
#include <cstdarg>
#include <cstdio>

#if defined(__ANDROID__)
#include <android/log.h>
#define LOG_TAG "NodeApiHost"
#elif defined(__APPLE__)
#include <TargetConditionals.h>
#endif

namespace {
constexpr auto LineFormat = "[%s] [NodeApiHost] ";

enum class LogLevel { Debug, Warning, Error };

constexpr std::string_view levelToString(LogLevel level) {
  switch (level) {
    case LogLevel::Debug:
      return "DEBUG";
    case LogLevel::Warning:
      return "WARNING";
    case LogLevel::Error:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

#if defined(__ANDROID__)
constexpr int androidLogLevel(LogLevel level) {
  switch (level) {
    case LogLevel::Debug:
      return ANDROID_LOG_DEBUG;
    case LogLevel::Warning:
      return ANDROID_LOG_WARN;
    case LogLevel::Error:
      return ANDROID_LOG_ERROR;
    default:
      return ANDROID_LOG_UNKNOWN;
  }
}
#endif

void log_message_internal(LogLevel level, const char* format, va_list args) {
#if defined(__ANDROID__)
  __android_log_vprint(androidLogLevel(level), LOG_TAG, format, args);
#elif defined(__APPLE__)
  // iOS or macOS
  const auto level_str = levelToString(level);
  fprintf(stderr, LineFormat, level_str.data());
  vfprintf(stderr, format, args);
  fprintf(stderr, "\n");
#else
  // Fallback for other platforms
  const auto level_str = levelToString(level);
  fprintf(stdout, LineFormat, level_str.data());
  vfprintf(stdout, format, args);
  fprintf(stdout, "\n");
#endif
}
}  // anonymous namespace

namespace callstack::nodeapihost {

void log_debug(const char* format, ...) {
  // TODO: Disable logging in release builds
  va_list args;
  va_start(args, format);
  log_message_internal(LogLevel::Debug, format, args);
  va_end(args);
}
void log_warning(const char* format, ...) {
  va_list args;
  va_start(args, format);
  log_message_internal(LogLevel::Warning, format, args);
  va_end(args);
}
void log_error(const char* format, ...) {
  va_list args;
  va_start(args, format);
  log_message_internal(LogLevel::Error, format, args);
  va_end(args);
}
}  // namespace callstack::nodeapihost
