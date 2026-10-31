#pragma once

#include "Logger.hpp"

#include <cstdlib>
#include <string>

namespace callstack::react_native_node_api {

[[noreturn]] inline void handleHermesFatal(const std::string &reason) noexcept {
  log_error("Hermes fatal error: %s", reason.c_str());
  std::abort();
}

/// Hermes keeps a single process-wide handler that can't be read back: this
/// replaces one set earlier, and one set later replaces this.
void installHermesFatalHandler();

} // namespace callstack::react_native_node_api
