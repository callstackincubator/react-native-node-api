#pragma once

#include <node_api.h>

#include <functional>
#include <memory>

// Mirror of the host-integration interface declared by the vendored Hermes in
// API/napi/hermes_napi.h. We mirror it here (rather than including that
// header) to avoid pulling in Hermes' own node_api.h alongside the
// weak-node-api copy already included transitively.
//
// IMPORTANT: member order and types must match API/napi/hermes_napi.h at the
// commit pinned as HERMES_GIT_SHA in src/node/cli/hermes.ts — re-diff this
// struct against that header whenever the pin is bumped.
//
// The declarations must be `extern "C"`: since facebook/hermes#2106 (included
// in the pinned Hermes commit) the public hermes_napi.h wraps its entry points
// in `extern "C"`, so Hermes exports the unmangled C symbol. Without matching
// C linkage here the reference would be to the C++-mangled name and the app
// fails to link ("Undefined symbol: hermes_napi_create_env").
extern "C" {
struct uv_loop_s;

struct hermes_napi_host {
  /// Schedule `execute` to run on a worker thread. When execute completes,
  /// schedule `complete` to run on the main (JS) thread with napi_ok, or with
  /// napi_cancelled if the work was cancelled before it started.
  void (*post_work)(void *loop_data, void *work_data,
                    void (*execute)(void *work_data),
                    void (*complete)(void *work_data, napi_status status));

  /// Attempt to cancel a previously posted work item. Returns true if the
  /// work was still queued (its `complete` will run with napi_cancelled),
  /// false if it already started or completed.
  bool (*cancel_work)(void *loop_data, void *work_data);

  /// Schedule `callback` to run on the main (JS) thread. Used by thread-safe
  /// functions to dispatch queued calls; may be invoked from any thread.
  void (*post_task)(void *loop_data, void *task_data,
                    void (*callback)(void *task_data));

  /// Opaque pointer passed as `loop_data` to the callbacks above.
  void *data;

  /// If non-null, napi_get_uv_event_loop() returns this pointer.
  struct uv_loop_s *uv_loop;

  /// If non-null, called by napi_fatal_exception() instead of aborting.
  void (*fatal_exception)(void *data, napi_env env, napi_value err);

  /// Optional libuv-style loop refs used by thread-safe functions; may both
  /// be null, in which case tsfn ref/unref are tracked but inert.
  void (*ref_loop)(void *loop_data);
  void (*unref_loop)(void *loop_data);
};

napi_env hermes_napi_create_env(void *hermes_runtime, hermes_napi_host *host);

/// Opens the shared library at `path`, resolves its init function (either the
/// exported `napi_register_module_v1` or, failing that, the `napi_module`
/// passed to a `napi_module_register` call made while loading), calls it with
/// a fresh `exports` object and hands the result back through `result`.
///
/// Requires an open handle scope on `env`. On failure it returns a non-`ok`
/// status and leaves an exception pending on `env`.
napi_status hermes_napi_load_module(napi_env env, const char *path,
                                    napi_value *result);
}

namespace callstack::react_native_node_api {

/// Provides the `hermes_napi_host` integration for the Hermes Node-API
/// environments created by the host: a worker pool backing
/// napi_queue_async_work / napi_cancel_async_work and a JS-thread dispatcher
/// backing thread-safe functions.
///
/// One instance exists per React Native runtime. The JS-thread hop is
/// type-erased as `JsDispatcher` (backed by CallInvoker::invokeAsync in the
/// app) so this class has no React Native dependencies and its threading
/// machinery can be exercised by plain C++ tests.
class HostContext : public std::enable_shared_from_this<HostContext> {
public:
  /// Dispatches a function onto the JS thread, returning whether it was
  /// accepted for delivery. Implementations must be safe to call from
  /// arbitrary threads, must never run the function inline and must deliver
  /// accepted functions one at a time, in order, on the single JS thread.
  /// Returning false (and dropping the function) is only acceptable once the
  /// JS runtime is gone — callers use the verdict to report outcomes
  /// truthfully, e.g. cancel_work only claims success while the cancelled
  /// completion can actually be delivered.
  using JsDispatcher = std::function<bool(std::function<void()> &&)>;

  static std::shared_ptr<HostContext> create(JsDispatcher dispatchToJs);

  /// Keep `context` alive for the remaining lifetime of the process. The
  /// Hermes env reads the host struct during Runtime teardown *after* running
  /// env cleanup hooks (napi_env__::shutdown() runs cleanup hooks first, then
  /// hermes_napi_cleanup_tsfns, which reaches host_->unref_loop through
  /// releaseTsfnLoopRef — verified at the pinned Hermes commit), so no
  /// cleanup hook can tell us when the last env is truly done with the
  /// struct. Retaining the context forever guarantees the documented
  /// contract that the struct outlives every env it was passed to, at the
  /// cost of a small allocation per React Native runtime (i.e. per reload).
  static void retainForProcessLifetime(std::shared_ptr<HostContext> context);

  /// The struct to pass to hermes_napi_create_env. Owned by this context.
  hermes_napi_host *host() { return &host_; }

  bool dispatchToJs(std::function<void()> &&fn) {
    return dispatchToJs_(std::move(fn));
  }

  // host_.data points at this object and the static callbacks cast it back,
  // so a copied or moved instance would service callbacks meant for another.
  HostContext(const HostContext &) = delete;
  HostContext &operator=(const HostContext &) = delete;

private:
  explicit HostContext(JsDispatcher dispatchToJs);

  static void postWork(void *loop_data, void *work_data,
                       void (*execute)(void *work_data),
                       void (*complete)(void *work_data,
                                        napi_status status)) noexcept;
  static bool cancelWork(void *loop_data, void *work_data) noexcept;
  static void postTask(void *loop_data, void *task_data,
                       void (*callback)(void *task_data)) noexcept;
  static void fatalException(void *data, napi_env env, napi_value err) noexcept;

  JsDispatcher dispatchToJs_;
  hermes_napi_host host_;
  // Reentrancy guard for fatalException(): true for the duration of routing
  // an error through ErrorUtils.reportFatalError. fatalException always runs
  // synchronously on the JS thread (see its doc comment), so a plain member
  // — no atomics or thread_local — is sufficient to detect a handler that
  // itself triggers napi_fatal_exception before the outer call returns.
  bool inFatalException_ = false;
};

} // namespace callstack::react_native_node_api
