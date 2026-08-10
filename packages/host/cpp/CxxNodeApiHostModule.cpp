#include "CxxNodeApiHostModule.hpp"
#include "Logger.hpp"
#include "RuntimeNodeApiAsync.hpp"

#include <jsi/hermes-interfaces.h>

using namespace facebook;

// Declared by the vendored Hermes in API/napi/hermes_napi.h. We forward declare
// it here (rather than including that header) to avoid pulling in Hermes' own
// node_api.h alongside the weak-node-api copy already included transitively.
//
// The declaration must be `extern "C"`: since facebook/hermes#2106 (included in
// the pinned Hermes commit) the public hermes_napi.h wraps these entry points
// in `extern "C"`, so Hermes exports the unmangled C symbol. Without matching C
// linkage here the reference would be to the C++-mangled name and the app fails
// to link ("Undefined symbol: hermes_napi_create_env"). Passing host as nullptr
// is enough — async work / thread-safe functions will return failure until a
// host integration is wired up (Phase 3).
extern "C" {
struct hermes_napi_host;
napi_env hermes_napi_create_env(void *hermes_runtime, hermes_napi_host *host);
}

namespace callstack::react_native_node_api {

CxxNodeApiHostModule::CxxNodeApiHostModule(
    std::shared_ptr<react::CallInvoker> jsInvoker)
    : TurboModule(CxxNodeApiHostModule::kModuleName, jsInvoker) {
  methodMap_["requireNodeAddon"] =
      MethodMetadata{1, &CxxNodeApiHostModule::requireNodeAddon};

  callInvoker_ = std::move(jsInvoker);
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
    // https://github.com/callstackincubator/react-native-node-api/issues/4
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
  // https://github.com/callstackincubator/react-native-node-api/issues/4

  // Create this addon's Node-API environment. Hermes binds an env to its
  // low-level VM runtime, which we reach through the (unstable) IHermes JSI
  // interface, and takes ownership: the env is torn down with the runtime, so
  // there is nothing to free here. Each addon gets its own env, as in Node.
  if (addon.env == nullptr) {
    // Fully qualified: `using namespace facebook` makes a bare `hermes`
    // ambiguous with the top-level `::hermes` (VM) namespace pulled in via
    // <jsi/hermes-interfaces.h>.
    auto *hermes = facebook::jsi::castInterface<facebook::hermes::IHermes>(&rt);
    if (hermes == nullptr) {
      log_debug("NapiHost: JSI runtime is not castable to IHermes; cannot "
                "create a Node-API environment");
      abort();
    }
    addon.env = hermes_napi_create_env(hermes->getVMRuntimeUnsafe(), nullptr);
    assert(addon.env != nullptr);
  }
  napi_env env = addon.env;

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

  callstack::react_native_node_api::setCallInvoker(env, callInvoker_);
  return true;
}

} // namespace callstack::react_native_node_api
