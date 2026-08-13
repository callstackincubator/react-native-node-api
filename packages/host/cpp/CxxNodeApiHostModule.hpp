#pragma once

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>
#include <node_api.h>

#include "HermesNapiHost.hpp"

#include <memory>
#include <string>
#include <unordered_map>

namespace callstack::react_native_node_api {

class JSI_EXPORT CxxNodeApiHostModule : public facebook::react::TurboModule {
public:
  static constexpr const char *kModuleName = "NodeApiHost";

  CxxNodeApiHostModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

  static facebook::jsi::Value
  requireNodeAddon(facebook::jsi::Runtime &rt,
                   facebook::react::TurboModule &turboModule,
                   const facebook::jsi::Value args[], size_t count);
  facebook::jsi::Value requireNodeAddon(facebook::jsi::Runtime &rt,
                                        const facebook::jsi::String path);

protected:
  struct NodeAddon {
    // The name the addon's exports object is stored under on the JavaScript
    // global, which is how the napi_value crosses over to JSI.
    std::string generatedName;

    // The Node-API environment for this addon, created when the addon is
    // initialized. Node creates one env per addon (see
    // napi_module_register_by_symbol in Node's src/node_api.cc) and the env
    // carries addon-scoped state — instance data, last error info, the addon's
    // Node-API version — so addons must not share one. Owned by the Hermes
    // runtime, which tears it down when the runtime is destroyed.
    napi_env env = nullptr;
  };
  std::unordered_map<std::string, NodeAddon> nodeAddons_;
  std::shared_ptr<facebook::react::CallInvoker> callInvoker_;
  // The hermes_napi_host integration passed to every env this module creates.
  // Also retained process-wide, as the envs outlive this module on teardown.
  std::shared_ptr<HostContext> hostContext_;

  void loadNodeAddon(facebook::jsi::Runtime &rt, NodeAddon &addon,
                     const std::string &libraryName);
};

} // namespace callstack::react_native_node_api
