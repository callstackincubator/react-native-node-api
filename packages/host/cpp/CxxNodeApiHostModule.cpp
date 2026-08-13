#include "CxxNodeApiHostModule.hpp"
#include "Logger.hpp"

#include <jsi/hermes-interfaces.h>

#include <cassert>
#include <cstdio>
#include <string>

using namespace facebook;

namespace callstack::react_native_node_api {

namespace {

/// Renders the exception Hermes left pending on `env` as a message, clearing
/// it so the env is usable again. Returns an empty string if the exception
/// cannot be read, in which case the caller reports the status alone.
std::string takePendingExceptionMessage(napi_env env) {
  napi_value error = nullptr;
  if (napi_get_and_clear_last_exception(env, &error) != napi_ok ||
      error == nullptr) {
    return {};
  }
  napi_value asString = nullptr;
  if (napi_coerce_to_string(env, error, &asString) != napi_ok) {
    return {};
  }
  size_t length = 0;
  if (napi_get_value_string_utf8(env, asString, nullptr, 0, &length) !=
      napi_ok) {
    return {};
  }
  std::string message(length, '\0');
  if (napi_get_value_string_utf8(env, asString, message.data(), length + 1,
                                 &length) != napi_ok) {
    return {};
  }
  message.resize(length);
  return message;
}

} // namespace

CxxNodeApiHostModule::CxxNodeApiHostModule(
    std::shared_ptr<react::CallInvoker> jsInvoker)
    : TurboModule(CxxNodeApiHostModule::kModuleName, jsInvoker) {
  methodMap_["requireNodeAddon"] =
      MethodMetadata{1, &CxxNodeApiHostModule::requireNodeAddon};

  callInvoker_ = std::move(jsInvoker);

  // The JS-thread dispatcher behind the hermes_napi_host integration:
  // CallInvoker::invokeAsync is callable from any thread, never runs the
  // function inline and delivers in order on the JS thread.
  //
  // Teardown is the load-bearing case. What the host integration needs is
  // that a function handed to this dispatcher either runs on the JS thread
  // while the runtime is alive, or is dropped — never invoked against a
  // destroyed runtime. In bridgeless React Native the CallInvoker received
  // here is a RuntimeSchedulerCallInvoker holding a std::weak_ptr to the
  // RuntimeScheduler; the ReactInstance owns scheduler and runtime together
  // and invokeAsync no-ops once the scheduler is gone, so work cannot outlive
  // the runtime it targets. The weak capture below covers the remaining
  // window where this module (and its CallInvoker reference) is released
  // during instance teardown.
  //
  // Dropping is safe precisely because a drop implies that teardown: every
  // env this host serves is owned by that same runtime and destroyed with it,
  // so the completion or tsfn dispatch being dropped has no live observer.
  // The one caller that could still see the difference —
  // napi_cancel_async_work — receives the verdict through this dispatcher's
  // return value (see HostContext::cancelWork).
  hostContext_ = HostContext::create(
      [weakInvoker = std::weak_ptr(callInvoker_)](std::function<void()> &&fn) {
        auto invoker = weakInvoker.lock();
        if (!invoker) {
          log_warning(
              "NapiHost: dropping a task posted after runtime teardown");
          return false;
        }
        invoker->invokeAsync(std::move(fn));
        return true;
      });
  HostContext::retainForProcessLifetime(hostContext_);
}

jsi::Value
CxxNodeApiHostModule::requireNodeAddon(jsi::Runtime &rt,
                                       react::TurboModule &turboModule,
                                       const jsi::Value args[], size_t count) {
  auto &thisModule = static_cast<CxxNodeApiHostModule &>(turboModule);
  if (1 == count && args[0].isString()) {
    return thisModule.requireNodeAddon(rt, args[0].asString(rt));
  }
  throw jsi::JSError(rt, "Expected requireNodeAddon to be called with a single "
                         "library name string");
}

jsi::Value
CxxNodeApiHostModule::requireNodeAddon(jsi::Runtime &rt,
                                       const jsi::String libraryName) {
  const std::string libraryNameStr = libraryName.utf8(rt);

  auto [it, inserted] = nodeAddons_.emplace(libraryNameStr, NodeAddon());
  NodeAddon &addon = it->second;

  // Check if this module has been loaded already, if not then load it...
  if (inserted) {
    try {
      loadNodeAddon(rt, addon, libraryNameStr);
    } catch (...) {
      // Leave no half-initialized entry behind, so a later require of the same
      // addon retries the load instead of reading a missing global.
      nodeAddons_.erase(it);
      throw;
    }
  }

  // Look the exports up (using JSI) and return it...
  return rt.global().getProperty(rt, addon.generatedName.c_str());
}

void CxxNodeApiHostModule::loadNodeAddon(jsi::Runtime &rt, NodeAddon &addon,
                                         const std::string &libraryName) {
#if defined(__APPLE__)
  const std::string libraryPath =
      "@rpath/" + libraryName + ".framework/" + libraryName;
#elif defined(__ANDROID__)
  const std::string libraryPath = "lib" + libraryName + ".so";
#else
#error "Loading Node-API addons is unsupported on this platform"
#endif

  log_debug("[%s] Loading addon by '%s'", libraryName.c_str(),
            libraryPath.c_str());

  // Create this addon's Node-API environment. Hermes binds an env to its
  // low-level VM runtime, which we reach through the (unstable) IHermes JSI
  // interface, and takes ownership: the env is torn down with the runtime, so
  // there is nothing to free here. Each addon gets its own env, as in Node.
  //
  // Fully qualified: `using namespace facebook` makes a bare `hermes`
  // ambiguous with the top-level `::hermes` (VM) namespace pulled in via
  // <jsi/hermes-interfaces.h>.
  auto *hermes = facebook::jsi::castInterface<facebook::hermes::IHermes>(&rt);
  if (hermes == nullptr) {
    log_debug("NapiHost: JSI runtime is not castable to IHermes; cannot "
              "create a Node-API environment");
    abort();
  }
  addon.env = hermes_napi_create_env(hermes->getVMRuntimeUnsafe(),
                                     hostContext_->host());
  assert(addon.env != nullptr);
  napi_env env = addon.env;

  // A name to reference the exports object by from JSI. Instead of using
  // random numbers to avoid name clashes, we use the address of the env, which
  // is unique per addon per runtime.
  char generatedName[32];
  snprintf(generatedName, sizeof(generatedName), "RN$NodeAddon_%p",
           static_cast<void *>(env));
  addon.generatedName = generatedName;

  // Every napi_value below is created in this scope, and only reachable from
  // the JavaScript global (or dropped) once it closes.
  napi_handle_scope scope = nullptr;
  napi_status status = napi_open_handle_scope(env, &scope);
  assert(status == napi_ok);

  napi_value exports = nullptr;
  status = hermes_napi_load_module(env, libraryPath.c_str(), &exports);
  if (status == napi_ok) {
    napi_value global = nullptr;
    status = napi_get_global(env, &global);
    assert(status == napi_ok);
    status = napi_set_named_property(env, global, addon.generatedName.c_str(),
                                     exports);
    assert(status == napi_ok);
  }

  const bool failed = status != napi_ok;
  std::string message;
  if (failed) {
    message = takePendingExceptionMessage(env);
    if (message.empty()) {
      message = "Node-API status " + std::to_string(status);
    }
  }
  const napi_status closeStatus = napi_close_handle_scope(env, scope);
  assert(closeStatus == napi_ok);
  (void)closeStatus;

  if (failed) {
    throw jsi::JSError(rt, "Failed to load '" + libraryName + "' addon from '" +
                               libraryPath + "': " + message);
  }
}

} // namespace callstack::react_native_node_api
