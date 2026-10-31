#include "HermesFatalHandler.hpp"

#include <hermes/hermes.h>

namespace callstack::react_native_node_api {

void installHermesFatalHandler() {
  auto *setter =
      facebook::jsi::castInterface<facebook::hermes::ISetFatalHandler>(
          facebook::hermes::makeHermesRootAPI());
  if (setter == nullptr) {
    log_warning("Hermes doesn't support setting a fatal handler");
    return;
  }
  setter->setFatalHandler(handleHermesFatal);
}

} // namespace callstack::react_native_node_api
