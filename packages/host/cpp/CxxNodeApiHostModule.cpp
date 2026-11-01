#include "CxxNodeApiHostModule.hpp"
#include "Logger.hpp"

#include <jsi/hermes-interfaces.h>

#include <cassert>
#include <cstdio>
#include <string>

using namespace facebook;

namespace callstack::react_native_node_api {

namespace {

/// Hands `value` over to JSI. Hermes has no public bridge between `napi_value`
/// and `jsi::Value`, so it crosses through a global property named after the
/// env (unique per runtime), which is removed again straight after.
jsi::Value toJsiValue(jsi::Runtime &rt, napi_env env, napi_value value) {
  char name[32];
  snprintf(name, sizeof(name), "RN$NodeAddon_%p", static_cast<void *>(env));

  napi_value global = nullptr;
  napi_status status = napi_get_global(env, &global);
  assert(status == napi_ok);
  status = napi_set_named_property(env, global, name, value);
  assert(status == napi_ok);

  jsi::Value result = rt.global().getProperty(rt, name);

  napi_value key = nullptr;
  status = napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &key);
  assert(status == napi_ok);
  bool deleted = false;
  status = napi_delete_property(env, global, key, &deleted);
  assert(status == napi_ok && deleted);
  (void)status;
  (void)deleted;
  return result;
}

/// Takes the exception Hermes left pending on `env`, clearing it so the env is
/// usable again, or creates an error from `status` if there is none.
napi_value takeLoadError(napi_env env, napi_status status) {
  napi_value error = nullptr;
  if (napi_get_and_clear_last_exception(env, &error) == napi_ok &&
      error != nullptr) {
    napi_valuetype type = napi_undefined;
    if (napi_typeof(env, error, &type) == napi_ok && type != napi_undefined) {
      return error;
    }
  }
  const std::string message = "Node-API status " + std::to_string(status);
  napi_value messageValue = nullptr;
  napi_status createStatus = napi_create_string_utf8(
      env, message.c_str(), message.size(), &messageValue);
  assert(createStatus == napi_ok);
  createStatus = napi_create_error(env, nullptr, messageValue, &error);
  assert(createStatus == napi_ok);
  (void)createStatus;
  return error;
}

} // namespace

CxxNodeApiHostModule::CxxNodeApiHostModule(
    std::shared_ptr<react::CallInvoker> jsInvoker)
    : TurboModule(CxxNodeApiHostModule::kModuleName, jsInvoker) {
  methodMap_["dlopen"] = MethodMetadata{2, &CxxNodeApiHostModule::dlopen};

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

jsi::Value CxxNodeApiHostModule::dlopen(jsi::Runtime &rt,
                                        react::TurboModule &turboModule,
                                        const jsi::Value args[], size_t count) {
  auto &thisModule = static_cast<CxxNodeApiHostModule &>(turboModule);
  if (count >= 2 && args[0].isObject() && args[1].isString()) {
    thisModule.dlopen(rt, args[0].asObject(rt), args[1].asString(rt).utf8(rt));
    return jsi::Value::undefined();
  }
  throw jsi::JSError(
      rt, "Expected dlopen to be called with a module object and a filename");
}

void CxxNodeApiHostModule::dlopen(jsi::Runtime &rt, const jsi::Object &module,
                                  const std::string &filename) {
  log_debug("Loading addon from '%s'", filename.c_str());

  // Create this addon's Node-API environment. Hermes binds an env to its
  // low-level VM runtime, which we reach through the (unstable) IHermes JSI
  // interface, and takes ownership: the env is torn down with the runtime, so
  // there is nothing to free here. Each load gets its own env, as in Node.
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
  napi_env env = hermes_napi_create_env(hermes->getVMRuntimeUnsafe(),
                                        hostContext_->host());
  assert(env != nullptr);

  // Every napi_value below is created in this scope, and only reachable from
  // JSI (or dropped) once it closes.
  napi_handle_scope scope = nullptr;
  napi_status status = napi_open_handle_scope(env, &scope);
  assert(status == napi_ok);

  // Hermes creates the exports object itself rather than taking
  // `module.exports`, so its result replaces `module.exports` below.
  napi_value exports = nullptr;
  status = hermes_napi_load_module(env, filename.c_str(), &exports);
  const bool failed = status != napi_ok;
  jsi::Value result =
      toJsiValue(rt, env, failed ? takeLoadError(env, status) : exports);

  const napi_status closeStatus = napi_close_handle_scope(env, scope);
  assert(closeStatus == napi_ok);
  (void)closeStatus;

  if (failed) {
    throw jsi::JSError(rt, std::move(result));
  }
  module.setProperty(rt, "exports", std::move(result));
}

} // namespace callstack::react_native_node_api
