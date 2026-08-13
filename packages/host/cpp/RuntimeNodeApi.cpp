#include "RuntimeNodeApi.hpp"
#include "Logger.hpp"

#include <cstdlib>

namespace callstack::react_native_node_api {

// See the comment on the declaration in RuntimeNodeApi.hpp for why this
// deliberately shadows Hermes' own napi_fatal_error.
void napi_fatal_error(const char *location, size_t location_len,
                      const char *message, size_t message_len) {
  if (location && location_len) {
    log_error("Fatal Node-API error: %.*s %.*s", static_cast<int>(location_len),
              location, static_cast<int>(message_len), message);
  } else {
    log_error("Fatal Node-API error: %.*s", static_cast<int>(message_len),
              message);
  }
  abort();
}

} // namespace callstack::react_native_node_api
