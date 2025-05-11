#include "CxxNodeApiHostModule.hpp"
#include "Logger.hpp"

using namespace facebook;

namespace callstack::nodeapihost {

CxxNodeApiHostModule::CxxNodeApiHostModule(
    std::shared_ptr<react::CallInvoker> jsInvoker)
    : TurboModule(CxxNodeApiHostModule::kModuleName, jsInvoker) {
  methodMap_["requireNodeAddon"] =
      MethodMetadata{1, &CxxNodeApiHostModule::requireNodeAddon};
}

jsi::Value
CxxNodeApiHostModule::requireNodeAddon(jsi::Runtime &rt,
                                       react::TurboModule &turboModule,
                                       const jsi::Value args[], size_t count) {
  auto &thisModule = static_cast<CxxNodeApiHostModule &>(turboModule);
  if (1 == count && args[0].isString()) {
    return thisModule.requireNodeAddon(rt, args[0].asString(rt));
  }
  // TODO: Throw a meaningful error
  return jsi::Value::undefined();
}

jsi::Value
CxxNodeApiHostModule::requireNodeAddon(jsi::Runtime &rt,
                                       const jsi::String libraryName) {
  const std::string libraryNameStr = libraryName.utf8(rt);

  auto [it, inserted] = nodeAddons_.emplace(libraryNameStr, NodeAddon());
  NodeAddon &addon = it->second;

  // Check if this module has been loaded already, if not then load it...
  if (inserted) {
    if (!loadNodeAddon(addon, libraryNameStr)) {
      return jsi::Value::undefined();
    }
  }

  // Initialize the addon if it has not already been initialized
  if (!rt.global().hasProperty(rt, addon.generatedName.data())) {
    initializeNodeModule(rt, addon);
  }

  // Look the exports up (using JSI) and return it...
  return rt.global().getProperty(rt, addon.generatedName.data());
}

bool CxxNodeApiHostModule::loadNodeAddon(NodeAddon &addon,
                                         const std::string &libraryName) const {
#if defined(__APPLE__)
  std::string libraryPath =
      "@rpath/" + libraryName + ".framework/" + libraryName;
#elif defined(__ANDROID__)
  std::string libraryPath = "lib" + libraryName + ".so";
#else
  abort()
#endif

  log_debug("[%s] Loading addon by '%s'", libraryName.c_str(),
            libraryPath.c_str());

  typename LoaderPolicy::Symbol initFn = NULL;
  typename LoaderPolicy::Module library =
      LoaderPolicy::loadLibrary(libraryPath.c_str());
  if (NULL != library) {
    log_debug("[%s] Loaded addon", libraryName.c_str());
    addon.moduleHandle = library;

    // Generate a name allowing us to reference the exports object from JSI
    // later Instead of using random numbers to avoid name clashes, we just use
    // the pointer address of the loaded module
    addon.generatedName.resize(32, '\0');
    snprintf(addon.generatedName.data(), addon.generatedName.size(),
             "RN$NodeAddon_%p", addon.moduleHandle);

    initFn = LoaderPolicy::getSymbol(library, "napi_register_module_v1");
    if (NULL != initFn) {
      log_debug("[%s] Found napi_register_module_v1 (%p)", libraryName.c_str(),
                initFn);
      addon.init = (napi_addon_register_func)initFn;
    } else {
      log_debug("[%s] Failed to find napi_register_module_v1. Expecting the "
                "addon to call napi_module_register to register itself.",
                libraryName.c_str());
    }
    // TODO: Read "node_api_module_get_api_version_v1" to support the addon
    // declaring its Node-API version
    // @see
    // https://github.com/callstackincubator/react-native-node-api-modules/issues/4
  } else {
    log_debug("[%s] Failed to load library", libraryName.c_str());
  }
  return NULL != initFn;
}

bool CxxNodeApiHostModule::initializeNodeModule(jsi::Runtime &rt,
                                                NodeAddon &addon) {
  // We should check if the module has already been initialized
  assert(NULL != addon.moduleHandle);
  assert(NULL != addon.init);
  napi_status status = napi_ok;
  // TODO: Read the version from the addon
  // @see
  // https://github.com/callstackincubator/react-native-node-api-modules/issues/4
  napi_env env = reinterpret_cast<napi_env>(rt.createNodeApiEnv(8));

  // Create the "exports" object
  napi_value exports;
  status = napi_create_object(env, &exports);
  assert(status == napi_ok);

  // Call the addon init function to populate the "exports" object
  // Allowing it to replace the value entirely by its return value
  exports = addon.init(env, exports);

  napi_value global;
  napi_get_global(env, &global);
  assert(status == napi_ok);

  status =
      napi_set_named_property(env, global, addon.generatedName.data(), exports);
  assert(status == napi_ok);

  return true;
}

} // namespace callstack::nodeapihost
