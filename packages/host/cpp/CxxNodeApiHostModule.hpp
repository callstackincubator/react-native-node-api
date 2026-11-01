#pragma once

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>
#include <node_api.h>

#include "HermesNapiHost.hpp"

#include <memory>
#include <string>

namespace callstack::react_native_node_api {

class JSI_EXPORT CxxNodeApiHostModule : public facebook::react::TurboModule {
public:
  static constexpr const char *kModuleName = "NodeApiHost";

  CxxNodeApiHostModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

  static facebook::jsi::Value dlopen(facebook::jsi::Runtime &rt,
                                     facebook::react::TurboModule &turboModule,
                                     const facebook::jsi::Value args[],
                                     size_t count);
  void dlopen(facebook::jsi::Runtime &rt, const facebook::jsi::Object &module,
              const std::string &filename);

protected:
  std::shared_ptr<facebook::react::CallInvoker> callInvoker_;
  // The hermes_napi_host integration passed to every env this module creates.
  // Also retained process-wide, as the envs outlive this module on teardown.
  std::shared_ptr<HostContext> hostContext_;
};

} // namespace callstack::react_native_node_api
