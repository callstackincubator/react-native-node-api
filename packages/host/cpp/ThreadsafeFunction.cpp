#include "ThreadsafeFunction.hpp"
#include <unordered_map>
#include "Logger.hpp"
#include "RuntimeNodeApi.hpp"

// Global registry to map unique IDs to ThreadSafeFunction instances.
// We use IDs instead of raw pointers to avoid any use-after-free issues.
static std::unordered_map<std::uintptr_t,
    std::shared_ptr<callstack::nodeapihost::ThreadSafeFunction>>
    registry;
static std::mutex registryMutex;
static std::atomic<std::uintptr_t> nextId{1};

static constexpr size_t INITIAL_REF_COUNT = 1;

namespace callstack::nodeapihost {

ThreadSafeFunction::ThreadSafeFunction(
    std::weak_ptr<facebook::react::CallInvoker> callInvoker,
    napi_env env,
    napi_value jsFunc,
    napi_value asyncResource,
    napi_value asyncResourceName,
    size_t maxQueueSize,
    size_t initialThreadCount,
    void* threadFinalizeData,
    napi_finalize threadFinalizeCb,
    void* context,
    napi_threadsafe_function_call_js callJsCb)
    : id_{nextId.fetch_add(1, std::memory_order_relaxed)},
      callInvoker_{std::move(callInvoker)},
      env_{env},
      jsFunc_{jsFunc},
      asyncResource_{asyncResource},
      asyncResourceName_{asyncResourceName},
      maxQueueSize_{maxQueueSize},
      threadCount_{initialThreadCount},
      threadFinalizeData_{threadFinalizeData},
      threadFinalizeCb_{threadFinalizeCb},
      context_{context},
      callJsCb_{callJsCb} {
  if (jsFunc) {
    // Keep JS function alive across async hops
    const auto status =
        napi_create_reference(env, jsFunc, INITIAL_REF_COUNT, &jsFuncRef_);
    if (status != napi_ok) {
      napi_fatal_error("ThreadSafeFunction::ThreadSafeFunction",
          NAPI_AUTO_LENGTH,
          "Failed to create JS function reference",
          NAPI_AUTO_LENGTH);
    }
  }
}

ThreadSafeFunction::~ThreadSafeFunction() {
  if (jsFuncRef_) {
    napi_delete_reference(env_, jsFuncRef_);
  }
}

std::shared_ptr<ThreadSafeFunction> ThreadSafeFunction::create(
    std::weak_ptr<facebook::react::CallInvoker> callInvoker,
    napi_env env,
    napi_value jsFunc,
    napi_value asyncResource,
    napi_value asyncResourceName,
    size_t maxQueueSize,
    size_t initialThreadCount,
    void* threadFinalizeData,
    napi_finalize threadFinalizeCb,
    void* context,
    napi_threadsafe_function_call_js callJsCb) {
  const auto function =
      std::make_shared<ThreadSafeFunction>(std::move(callInvoker),
          env,
          jsFunc,
          asyncResource,
          asyncResourceName,
          maxQueueSize,
          initialThreadCount,
          threadFinalizeData,
          threadFinalizeCb,
          context,
          callJsCb);

  {
    std::lock_guard lock{registryMutex};
    registry[function->id_] = function;
  }

  return function;
}

std::shared_ptr<ThreadSafeFunction> ThreadSafeFunction::get(
    napi_threadsafe_function func) {
  std::lock_guard lock{registryMutex};
  // Cast the handle back to ID for registry lookup
  const auto id = reinterpret_cast<std::uintptr_t>(func);
  const auto it = registry.find(id);
  return it != registry.end() ? it->second : nullptr;
}

napi_threadsafe_function ThreadSafeFunction::getHandle() const noexcept {
  return reinterpret_cast<napi_threadsafe_function>(id_);
}

napi_status ThreadSafeFunction::getContext(void** result) noexcept {
  if (!result) {
    return napi_invalid_arg;
  }

  *result = context_;
  return napi_ok;
}

napi_status ThreadSafeFunction::call(
    void* data, napi_threadsafe_function_call_mode isBlocking) noexcept {
  if (isClosingOrAborted()) {
    return napi_closing;
  }

  {
    std::unique_lock lock{queueMutex_};
    // Backpressure: enforce maxQueueSize_. If nonblocking, fail fast; if
    // blocking, wait until space is available or closing/aborted.
    if (maxQueueSize_ && queue_.size() >= maxQueueSize_) {
      if (isBlocking == napi_tsfn_nonblocking) {
        return napi_queue_full;
      }
      queueCv_.wait(lock, [&] {
        return queue_.size() < maxQueueSize_ || isClosingOrAborted();
      });
      if (isClosingOrAborted()) return napi_closing;
    }
    queue_.push(data);
  }

  const auto invoker = callInvoker_.lock();
  if (!invoker) {
    log_debug("Error: No CallInvoker available for ThreadSafeFunction");
    return napi_generic_failure;
  }
  // Invoke from the current thread. Libraries like NativeScript can wrap a
  // JS function in an Objective-C block to be dispatched onto another thread
  // (e.g. the main thread, with the intention of accessing the UI), and so we
  // should run the JS function on the same thread the Objective-C block was
  // dispatched to.
  invoker->invokeSync([self = shared_from_this()] { self->processQueue(); });
  return napi_ok;
}

napi_status ThreadSafeFunction::acquire() noexcept {
  if (closing_.load(std::memory_order_acquire)) {
    return napi_closing;
  }
  threadCount_.fetch_add(1, std::memory_order_acq_rel);
  return napi_ok;
}

napi_status ThreadSafeFunction::release(
    napi_threadsafe_function_release_mode mode) noexcept {
  // Node-API semantics: abort prevents further JS calls and wakes any waiters.
  if (mode == napi_tsfn_abort) {
    aborted_.store(true, std::memory_order_relaxed);
    closing_.store(true, std::memory_order_release);
  }

  const auto remaining = threadCount_.fetch_sub(1, std::memory_order_acq_rel);

  // When the last thread is gone (or we're closing), notify and finalize.
  if (remaining <= 1 || closing_.load(std::memory_order_acquire)) {
    std::lock_guard lock{queueMutex_};
    const bool emptyQueue = queue_.empty();
    if (maxQueueSize_) {
      queueCv_.notify_all();
    }
    if (aborted_.load(std::memory_order_acquire) || emptyQueue) {
      finalize();
    }
  }
  return napi_ok;
}

napi_status ThreadSafeFunction::ref() noexcept {
  // In libuv, this allows the loop to exit if nothing else is keeping it
  // alive. In RN this is a no-op beyond state tracking.
  referenced_.store(true, std::memory_order_relaxed);
  return napi_ok;
}

napi_status ThreadSafeFunction::unref() noexcept {
  // In libuv, this allows the loop to exit if nothing else is keeping it
  // alive. In RN this is a no-op beyond state tracking.
  referenced_.store(false, std::memory_order_relaxed);
  return napi_ok;
}

void ThreadSafeFunction::finalize() {
  // Ensure finalization happens exactly once
  bool expected = false;
  if (!finalizeScheduled_.compare_exchange_strong(
          expected, true, std::memory_order_acq_rel)) {
    return;
  }

  closing_.store(true, std::memory_order_release);

  const auto onFinalize = [self = shared_from_this()] {
    if (self->threadFinalizeCb_) {
      self->threadFinalizeCb_(
          self->env_, self->threadFinalizeData_, self->context_);
    }
    std::lock_guard lock{registryMutex};
    registry.erase(self->id_);
  };

  // Prefer running the finalizer on the JS thread to match expectations;
  // if CallInvoker is gone, run synchronously.
  if (const auto invoker = callInvoker_.lock()) {
    invoker->invokeAsync(onFinalize);
  } else {
    onFinalize();
  }
}

void ThreadSafeFunction::processQueue() {
  void* queuedData{nullptr};
  bool empty{false};

  // Extract data from queue
  {
    std::lock_guard lock{queueMutex_};
    if (!queue_.empty()) {
      queuedData = queue_.front();
      const bool wasAtMaxCapacity = (queue_.size() == maxQueueSize_);
      queue_.pop();
      empty = queue_.empty();

      // Notify waiting threads if queue was at max capacity
      if (wasAtMaxCapacity && maxQueueSize_) {
        queueCv_.notify_one();
      }
    }
  }

  // Execute JS callback if we have data and aren't aborted
  if (queuedData && !aborted_.load(std::memory_order_relaxed)) {
    if (callJsCb_) {
      // Prefer the user-provided callJsCb_ (Node-API compatible)
      napi_value fn{nullptr};
      if (jsFuncRef_) {
        napi_get_reference_value(env_, jsFuncRef_, &fn);
      }
      callJsCb_(env_, fn, context_, queuedData);
    } else if (jsFuncRef_) {
      // Fallback: call JS function directly with no args
      napi_value fn{nullptr};
      if (napi_get_reference_value(env_, jsFuncRef_, &fn) == napi_ok) {
        napi_value recv{nullptr};
        napi_get_undefined(env_, &recv);
        napi_value result{nullptr};
        napi_call_function(env_, recv, fn, 0, nullptr, &result);
      }
    }
  }

  // Auto-finalize when: no remaining threads, queue drained, and not closing
  if (shouldFinalize() && empty) {
    finalize();
  }
}

bool ThreadSafeFunction::isClosingOrAborted() const noexcept {
  return aborted_.load(std::memory_order_relaxed) ||
         closing_.load(std::memory_order_relaxed);
}

bool ThreadSafeFunction::shouldFinalize() const noexcept {
  return threadCount_.load(std::memory_order_acquire) == 0 &&
         !closing_.load(std::memory_order_acquire);
}
}  // namespace callstack::nodeapihost