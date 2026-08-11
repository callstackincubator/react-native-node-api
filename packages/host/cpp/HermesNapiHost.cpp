#include "HermesNapiHost.hpp"
#include "Logger.hpp"

#include <condition_variable>
#include <cstdlib>
#include <deque>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace callstack::react_native_node_api {
namespace {

struct WorkItem {
  // Identifies the HostContext that posted the item; matched together with
  // workData on cancellation, since the pool is shared by all runtimes and a
  // freed napi_async_work address could be reused by another env.
  void *loopData = nullptr;
  // The dispatcher may expire while an item is in flight (React Native
  // reload); the completion is then dropped, which is safe because the env it
  // targets is torn down with its runtime.
  std::weak_ptr<HostContext> context;
  void *workData = nullptr;
  void (*execute)(void *work_data) = nullptr;
  void (*complete)(void *work_data, napi_status status) = nullptr;
};

class WorkerPool {
public:
  static WorkerPool &instance() {
    // Deliberately leaked, with detached threads, like libuv's process-global
    // thread pool: the pool must be able to outlive any single React Native
    // runtime and there is no shutdown point at which joining would be safe.
    static WorkerPool *pool = new WorkerPool();
    return *pool;
  }

  void enqueue(WorkItem &&item) {
    {
      std::lock_guard lock(mutex_);
      for (const WorkItem &queued : queue_) {
        if (queued.loopData == item.loopData &&
            queued.workData == item.workData) {
          // Queueing the same napi_async_work twice is undefined behavior in
          // Node (libuv asserts); warn instead of crashing.
          log_warning(
              "NapiHost: napi_async_work %p was queued while already queued",
              item.workData);
          break;
        }
      }
      queue_.push_back(std::move(item));
    }
    cv_.notify_one();
  }

  bool tryRemove(void *loopData, void *workData, WorkItem &result) {
    std::lock_guard lock(mutex_);
    for (auto it = queue_.begin(); it != queue_.end(); ++it) {
      if (it->loopData == loopData && it->workData == workData) {
        result = std::move(*it);
        queue_.erase(it);
        return true;
      }
    }
    return false;
  }

private:
  // libuv's default thread pool size. Keep this below 5: the cancellation
  // tests make cancel-while-queued deterministic by saturating the pool with
  // 5 blocking jobs before queueing the item they cancel.
  static constexpr size_t kThreadCount = 4;

  WorkerPool() {
    for (size_t i = 0; i < kThreadCount; i++) {
      std::thread([this] { workerMain(); }).detach();
    }
  }

  void workerMain() {
    for (;;) {
      WorkItem item;
      {
        std::unique_lock lock(mutex_);
        cv_.wait(lock, [this] { return !queue_.empty(); });
        item = std::move(queue_.front());
        queue_.pop_front();
      }
      // An item is either popped here (execute runs, complete gets napi_ok)
      // or removed by tryRemove (complete gets napi_cancelled) — never both,
      // as both happen under the queue mutex.
      item.execute(item.workData);
      if (auto context = item.context.lock()) {
        context->dispatchToJs(
            [workData = item.workData, complete = item.complete] {
              // No pool state refers to workData at this point, so the
              // complete callback is free to napi_delete_async_work it.
              complete(workData, napi_ok);
            });
      } else {
        log_warning("NapiHost: dropping an async work completion posted after "
                    "runtime teardown");
      }
    }
  }

  std::mutex mutex_;
  std::condition_variable cv_;
  std::deque<WorkItem> queue_;
};

std::optional<std::string> stringValue(napi_env env, napi_value value) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) {
    return std::nullopt;
  }
  std::string result(length, '\0');
  if (napi_get_value_string_utf8(env, value, result.data(), length + 1,
                                 nullptr) != napi_ok) {
    return std::nullopt;
  }
  return result;
}

std::string describeError(napi_env env, napi_value err) {
  // Prefer the error's stack (which includes its message), fall back to
  // coercing the value to a string. Every call is status-checked: this runs
  // right before an abort and must not assume anything about the value.
  napi_value stack = nullptr;
  napi_valuetype type = napi_undefined;
  if (napi_get_named_property(env, err, "stack", &stack) == napi_ok &&
      napi_typeof(env, stack, &type) == napi_ok && type == napi_string) {
    if (auto text = stringValue(env, stack)) {
      return *text;
    }
  }
  napi_value coerced = nullptr;
  if (napi_coerce_to_string(env, err, &coerced) == napi_ok) {
    if (auto text = stringValue(env, coerced)) {
      return *text;
    }
  }
  return "(unable to stringify the error value)";
}

} // namespace

HostContext::HostContext(JsDispatcher dispatchToJs)
    : dispatchToJs_(std::move(dispatchToJs)),
      host_{
          .post_work = &HostContext::postWork,
          // Hermes null-checks only the host pointer itself before invoking
          // post_work and cancel_work, so neither may individually be null.
          .cancel_work = &HostContext::cancelWork,
          .post_task = &HostContext::postTask,
          .data = this,
          // React Native has no libuv loop: napi_get_uv_event_loop() returns
          // napi_generic_failure, as upstream documents for non-Node hosts.
          .uv_loop = nullptr,
          .fatal_exception = &HostContext::fatalException,
          // The JS thread outlives every producer thread, so there is no loop
          // lifetime to model: tsfn ref/unref are tracked by Hermes but inert.
          .ref_loop = nullptr,
          .unref_loop = nullptr,
      } {}

std::shared_ptr<HostContext> HostContext::create(JsDispatcher dispatchToJs) {
  return std::shared_ptr<HostContext>(new HostContext(std::move(dispatchToJs)));
}

void HostContext::retainForProcessLifetime(
    std::shared_ptr<HostContext> context) {
  // Leaked for the same reason as the WorkerPool: no safe destruction point.
  static std::mutex *mutex = new std::mutex();
  static auto *retained = new std::vector<std::shared_ptr<HostContext>>();
  std::lock_guard lock(*mutex);
  retained->push_back(std::move(context));
}

void HostContext::postWork(void *loop_data, void *work_data,
                           void (*execute)(void *work_data),
                           void (*complete)(void *work_data,
                                            napi_status status)) noexcept {
  auto *self = static_cast<HostContext *>(loop_data);
  // Called on the JS thread (napi_queue_async_work) while the env — and
  // therefore this context — is alive, so weak_from_this() is populated.
  WorkerPool::instance().enqueue(WorkItem{
      .loopData = loop_data,
      .context = self->weak_from_this(),
      .workData = work_data,
      .execute = execute,
      .complete = complete,
  });
}

bool HostContext::cancelWork(void *loop_data, void *work_data) noexcept {
  WorkItem item;
  if (!WorkerPool::instance().tryRemove(loop_data, work_data, item)) {
    // Already picked up by a worker (or never queued): cancellation failed
    // and Hermes surfaces napi_generic_failure, like Node.
    return false;
  }
  if (auto context = item.context.lock()) {
    // Deliver the cancelled completion asynchronously, matching Node, where a
    // cancelled complete callback still runs on a later loop tick.
    context->dispatchToJs([workData = item.workData, complete = item.complete] {
      complete(workData, napi_cancelled);
    });
    return true;
  }
  // The runtime is being torn down; the complete callback can never run, so
  // report the cancellation as failed.
  return false;
}

void HostContext::postTask(void *loop_data, void *task_data,
                           void (*callback)(void *task_data)) noexcept {
  auto *self = static_cast<HostContext *>(loop_data);
  // Thread-safe functions call this from arbitrary producer threads, and
  // Hermes' tsfnDispatch re-posts itself from inside the callback. The
  // dispatcher never runs the callback inline (JS would run off-thread) and
  // never drops it while the runtime is alive — a dropped dispatch would
  // permanently wedge the tsfn, as its dispatch_pending flag stays set.
  self->dispatchToJs_([task_data, callback] { callback(task_data); });
}

void HostContext::fatalException(void *, napi_env env,
                                 napi_value err) noexcept {
  // Called on the JS thread by napi_fatal_exception(). Node routes this to
  // process.emit('uncaughtException'); with no process object we log the
  // error and abort — the same observable outcome as Hermes' null-host
  // default, but surfaced through the host logger. `err` is only valid for
  // the duration of this call, so it is stringified before returning.
  log_error("napi_fatal_exception: %s", describeError(env, err).c_str());
  abort();
}

} // namespace callstack::react_native_node_api
