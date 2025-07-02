#pragma once

#include <string_view>  // std::string_view

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>
#include <node_api.h>

#include "AddonLoaders.hpp"

namespace callstack::nodeapihost {

class JSI_EXPORT CxxNodeApiHostModule : public facebook::react::TurboModule {
public:
  static constexpr const char *kModuleName = "NodeApiHost";

  using ResolverFunc = std::function<facebook::jsi::Value(
    facebook::jsi::Runtime&,
    const std::string_view&,
    const std::string_view&,
    const std::string_view&)>;

  CxxNodeApiHostModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

  static facebook::jsi::Value
  requireNodeAddon(facebook::jsi::Runtime &rt,
                   facebook::react::TurboModule &turboModule,
                   const facebook::jsi::Value args[], size_t count);
  facebook::jsi::Value requireNodeAddon(facebook::jsi::Runtime &rt,
                                        const facebook::jsi::String &requiredPath,
                                        const facebook::jsi::String &requiredPackageName,
                                        const facebook::jsi::String &originalId);
  facebook::jsi::Value requireNodeAddon(facebook::jsi::Runtime &rt,
                                        const std::string &requiredPath,
                                        const std::string &requiredPackageName,
                                        const std::string &originalId);

  facebook::jsi::Value resolveRelativePath(facebook::jsi::Runtime &rt,
                                           const std::string_view &requiredPath,
                                           const std::string_view &requiredPackageName,
                                           const std::string_view &originalId);

  std::pair<facebook::jsi::Value, bool>
  lookupRequireCache(facebook::jsi::Runtime &rt,
                     const std::string_view &packageName,
                     const std::string_view &subpath);
  void updateRequireCache(facebook::jsi::Runtime &rt,
                          const std::string_view &packageName,
                          const std::string_view &subpath,
                          facebook::jsi::Value &value);

protected:
  std::unordered_map<std::string, ResolverFunc> prefixResolvers_;
  std::unordered_map<std::string, ResolverFunc> packageOverrides_;
};

} // namespace callstack::nodeapihost
