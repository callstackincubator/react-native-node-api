#pragma once

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>
#include <node_api.h>

#include "AddonLoaders.hpp"

namespace callstack::nodeapihost {

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
    void *moduleHandle;
    napi_addon_register_func init;
    std::string generatedName;
  };
  std::unordered_map<std::string, NodeAddon> nodeAddons_;
  std::shared_ptr<facebook::react::CallInvoker> callInvoker_;

  using LoaderPolicy = PosixLoader; // FIXME: HACK: This is temporary workaround
                                    // for my lazyness (work on iOS and Android)

  bool loadNodeAddon(NodeAddon &addon, const std::string &path) const;
  bool initializeNodeModule(facebook::jsi::Runtime &rt, NodeAddon &addon);
};

} // namespace callstack::nodeapihost
