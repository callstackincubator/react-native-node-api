#pragma once

#include <unordered_map>
#include <jsi/jsi.h>
#include <node_api.h>
#include "AddonLoaders.hpp"

namespace callstack::nodeapihost {

class AddonRegistry {
public:
  struct NodeAddon {
    NodeAddon(std::string packageName, std::string subpath)
      : packageName_(packageName)
      , subpath_(subpath)
    {}

    inline bool isLoaded() const { return nullptr != initFun_; }

    std::string packageName_;
    std::string subpath_;
    std::string loadedFilePath_;
    void *moduleHandle_ = nullptr;
    napi_addon_register_func initFun_ = nullptr;
    int32_t moduleApiVersion_;
  };

  NodeAddon& loadAddon(std::string packageName, std::string subpath);
  facebook::jsi::Value instantiateAddonInRuntime(facebook::jsi::Runtime &rt, NodeAddon &addon);
  bool handleOldNapiModuleRegister(napi_addon_register_func addonInitFunc);

  using LoaderPolicy = PosixLoader; // FIXME: HACK: This is temporary workaround
                                    // for my lazyness (works on iOS and Android)
private:
  bool tryLoadAddonAsDynamicLib(NodeAddon &addon, const std::string &path);
  napi_status createAddonDescriptor(napi_env env, napi_value exports, napi_value *outDescriptor);
  napi_status storeAddonByFullPath(napi_env env, napi_value global, const std::string &fqap, napi_value descriptor);
  facebook::jsi::Value lookupAddonByFullPath(facebook::jsi::Runtime &rt, const std::string &fqap);

  static constexpr const char *kInternalRegistryKey = "$NodeApiHost";
  std::unordered_map<std::string, NodeAddon> trackedAddons_;
  napi_addon_register_func pendingRegistration_;
};

} // namespace callstack::nodeapihost
