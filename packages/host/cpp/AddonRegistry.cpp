#include "AddonRegistry.hpp"
#include <cctype>  // for std::isalnum

#ifndef NODE_API_DEFAULT_MODULE_API_VERSION
#define NODE_API_DEFAULT_MODULE_API_VERSION 8
#endif

using namespace facebook;

namespace {
napi_status napi_emplace_named_property_object(napi_env env,
                                               napi_value object,
                                               const char *utf8Name,
                                               napi_value *outObject) {
  bool propertyFound = false;
  napi_status status = napi_has_named_property(env, object, utf8Name, &propertyFound);
  assert(napi_ok == status);

  assert(nullptr != outObject);
  if (propertyFound) {
    status = napi_get_named_property(env, object, utf8Name, outObject);
  } else {
    // Need to create it first
    status = napi_create_object(env, outObject);
    assert(napi_ok == status);

    status = napi_set_named_property(env, object, utf8Name, *outObject);
  }
  
  return status;
}

bool endsWith(const std::string_view &str, const std::string_view &suffix) {
#if __cplusplus >= 202002L // __cpp_lib_starts_ends_with
  return str.ends_with(suffix);
#else
  return str.size() >= suffix.size()
    && std::equal(suffix.rbegin(), suffix.rend(), str.rbegin());
#endif
}

std::string_view stripSuffix(const std::string_view &str, const std::string_view &suffix) {
  if (endsWith(str, suffix)) {
    return str.substr(0, str.size() - suffix.size());
  } else {
    return str;
  }
}

void sanitizeLibraryNameInplace(std::string &name) {
  // Strip the extension (if present)
  // NOTE: This is needed when working with updated Babel plugin
  name = stripSuffix(name, ".node");

  for (char &c : name) {
    if (!std::isalnum(c)) {
      c = '-';
    }
  }
}
} // namespace

namespace callstack::nodeapihost {

AddonRegistry::NodeAddon& AddonRegistry::loadAddon(std::string packageName,
                                                   std::string subpath) {
  const std::string fqan = packageName + subpath.substr(1);
  auto [it, inserted] =
      trackedAddons_.try_emplace(fqan, NodeAddon(packageName, subpath));
  NodeAddon &addon = it->second;

  sanitizeLibraryNameInplace(packageName);
  sanitizeLibraryNameInplace(subpath);
  const std::string libraryName = packageName + subpath;

  if (inserted || !it->second.isLoaded()) {
#if defined(__APPLE__)
    const std::string libraryPath = "@rpath/" + libraryName + ".framework/" + libraryName;
    tryLoadAddonAsDynamicLib(addon, libraryPath);
#elif defined(__ANDROID__)
    const std::string libraryPath = "lib" + libraryName + ".so";
    tryLoadAddonAsDynamicLib(addon, libraryPath);
#else
    abort();
#endif
  }

  return addon;
}

bool AddonRegistry::tryLoadAddonAsDynamicLib(NodeAddon &addon, const std::string &path) {
  {
    // There can be only a SINGLE pending module (the same limitation
    // has Node.js since Jan 28, 2014 commit 76b9846, see link below).
    // We MUST clear it before attempting to load next addon.
    // https://github.com/nodejs/node/blob/76b98462e589a69d9fd48ccb9fb5f6e96b539715/src/node.cc#L1949)
    assert(nullptr == pendingRegistration_);
  }

  // Load addon as dynamic library
  typename LoaderPolicy::Module library = LoaderPolicy::loadLibrary(path.c_str());
  if (nullptr != library) {
    addon.moduleApiVersion_ = NODE_API_DEFAULT_MODULE_API_VERSION;
    if (nullptr != pendingRegistration_) {
      // there is a pending addon that used the deprecated `napi_register_module()`
      addon.initFun_ = pendingRegistration_;
    } else {
      // pending addon remains empty, we should look for the symbols...
      typename LoaderPolicy::Symbol initFn = LoaderPolicy::getSymbol(library, "napi_register_module_v1");
      if (nullptr != initFn) {
        addon.initFun_ = (napi_addon_register_func)initFn;
        // This solves https://github.com/callstackincubator/react-native-node-api-modules/issues/4
        typename LoaderPolicy::Symbol getVersionFn = LoaderPolicy::getSymbol(library, "node_api_module_get_api_version_v1");
        if (nullptr != getVersionFn) {
          addon.moduleApiVersion_ = ((node_api_addon_get_api_version_func)getVersionFn)();
        }
      }
    }

    if (nullptr != addon.initFun_) {
      addon.moduleHandle_ = (void *)library;
      addon.loadedFilePath_ = path;
    }
  }

  // We MUST clear the `pendingAddon_`, even when the module failed to load!
  // See: https://github.com/nodejs/node/commit/a60056df3cad2867d337fc1d7adeebe66f89031a
  pendingRegistration_ = nullptr;
  return addon.isLoaded();
}

jsi::Value AddonRegistry::instantiateAddonInRuntime(jsi::Runtime &rt, NodeAddon &addon) {
  // We should check if the module has already been initialized
  assert(true == addon.isLoaded());
  assert(addon.moduleApiVersion_ > 0 && addon.moduleApiVersion_ <= 10);

  napi_status status = napi_ok;
  napi_env env = reinterpret_cast<napi_env>(rt.createNodeApiEnv(addon.moduleApiVersion_));

  // Create the "exports" object
  napi_value exports;
  status = napi_create_object(env, &exports);
  assert(napi_ok == status);

  // Call the addon init function to populate the "exports" object
  // Allowing it to replace the value entirely by its return value
  // TODO: Check the return value (see Node.js specs)
  exports = addon.initFun_(env, exports);

  // "Compute" the Fully Qualified Addon Path
  const std::string fqap = addon.packageName_ + addon.subpath_.substr(1);

  {
    napi_value descriptor;
    status = createAddonDescriptor(env, exports, &descriptor);
    assert(napi_ok == status);

    napi_value global;
    napi_get_global(env, &global);
    assert(napi_ok == status);

    status = storeAddonByFullPath(env, global, fqap, descriptor);
    assert(napi_ok == status);
  }

  return lookupAddonByFullPath(rt, fqap);
}

bool AddonRegistry::handleOldNapiModuleRegister(napi_addon_register_func addonInitFunc) {
  assert(nullptr == pendingRegistration_);
  pendingRegistration_ = addonInitFunc;
  return true;
}

napi_status AddonRegistry::createAddonDescriptor(napi_env env, napi_value exports, napi_value *outDescriptor) {
  // Create the descriptor object
  assert(nullptr != outDescriptor);
  napi_status status = napi_create_object(env, outDescriptor);

  // Point the `env` property to the current `napi_env`
  if (napi_ok == status) {
    napi_value env_value;
    status = napi_create_external(env, env, nullptr, nullptr, &env_value);
    if (napi_ok == status) {
      status = napi_set_named_property(env, *outDescriptor, "env", env_value);
    }
  }

  // Cache the addons exports in descriptor's `exports` property
  if (napi_ok == status) {
    status = napi_set_named_property(env, *outDescriptor, "exports", exports);
  }

  return status;
}

napi_status AddonRegistry::storeAddonByFullPath(napi_env env, napi_value global, const std::string &fqap, napi_value descriptor) {
  // Get the internal registry object
  napi_value registryObject;
  napi_status status = napi_emplace_named_property_object(env, global, kInternalRegistryKey, &registryObject);
  assert(napi_ok == status);

  status = napi_set_named_property(env, registryObject, fqap.c_str(), descriptor);
  return status;
}

jsi::Value AddonRegistry::lookupAddonByFullPath(jsi::Runtime &rt, const std::string &fqap) {
  // Get the internal registry object
  jsi::Object global = rt.global();
  if (!global.hasProperty(rt, kInternalRegistryKey)) {
    // Create it first
    jsi::Object registryObject = jsi::Object(rt);
    global.setProperty(rt, kInternalRegistryKey, registryObject);
  }
  jsi::Value registryValue = global.getProperty(rt, kInternalRegistryKey);
  jsi::Object registryObject = registryValue.asObject(rt);

  // Lookup by addon path
  jsi::Value addonValue(nullptr);
  if (registryObject.hasProperty(rt, fqap.c_str())) {
    addonValue = registryObject.getProperty(rt, fqap.c_str());
  }
  return addonValue;
}

} // namespace callstack::nodeapihost
