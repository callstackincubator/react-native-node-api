#include "ThreadsafeFunction.hpp"
#include "Logger.hpp"

// This file provides a React Native-friendly implementation of Node-API's
// thread-safe function primitive. In RN we don't own/libuv, so we:
// - Use CallInvoker to hop onto the JS thread instead of uv_async.
// - Track a registry mapping native handles to shared_ptrs for lookup/lifetime.
// - Emulate ref/unref semantics without affecting any event loop.

static std::unordered_map<napi_threadsafe_function,
    std::shared_ptr<callstack::nodeapihost::ThreadSafeFunction>>
    registry;
static std::mutex registryMutex;

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
    : callInvoker_{std::move(callInvoker)},
      env_{env},
      jsFunc_{jsFunc},
      asyncResource_{asyncResource},
      asyncResourceName_{asyncResourceName},
      maxQueueSize_{maxQueueSize},
      threadCount_{initialThreadCount},
      threadFinalizeData_{threadFinalizeData},
      threadFinalizeCb_{threadFinalizeCb},
      context_{context},
      callJsCb_{callJsCb},
      refCount_{initialThreadCount} {
  if (jsFunc) {
    // Keep JS function alive across async hops; fatal here mirrors Node-API's
    // behavior when environment is irrecoverable.
    const auto status = napi_create_reference(env, jsFunc, 1, &jsFuncRef_);
    if (status != napi_ok) {
      napi_fatal_error(nullptr,
          0,
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
    auto handle = reinterpret_cast<napi_threadsafe_function>(function.get());
    std::lock_guard lock{registryMutex};
    registry[handle] = function;
  }

  return std::move(function);
}

std::shared_ptr<ThreadSafeFunction> ThreadSafeFunction::get(
    napi_threadsafe_function func) {
  std::lock_guard lock{registryMutex};
  return registry.contains(func) ? registry[func] : nullptr;
}

napi_status ThreadSafeFunction::getContext(void** result) {
  if (!result) {
    return napi_invalid_arg;
  }

  *result = context_;
  return napi_ok;
}

napi_status ThreadSafeFunction::call(
    void* data, napi_threadsafe_function_call_mode isBlocking) {
  if (aborted_ || closing_) {
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
        return queue_.size() < maxQueueSize_ || aborted_ || closing_;
      });
      if (aborted_ || closing_) return napi_closing;
    }
    queue_.push(data);
  }

  const auto invoker = callInvoker_.lock();
  if (!invoker) {
    log_debug("Error: No CallInvoker available for ThreadSafeFunction");
    return napi_generic_failure;
  }
  // Hop to JS thread; we drain one item per hop to keep latency predictable
  // and avoid long monopolization of the JS queue.
  invoker->invokeAsync([this] {
    void* queuedData{nullptr};
    auto empty{false};
    {
      std::lock_guard lock{queueMutex_};
      if (!queue_.empty()) {
        queuedData = queue_.front();
        const auto size = queue_.size();
        queue_.pop();
        empty = queue_.empty();
        if (size == maxQueueSize_ && maxQueueSize_) {
          queueCv_.notify_one();
        }
      }
    }
    if (queuedData && !aborted_) {
      // Prefer the user-provided callJsCb_ (Node-API compatible). If absent
      // but we have a JS function ref, call it directly with no args.
      if (callJsCb_) {
        napi_value fn{nullptr};
        if (jsFuncRef_) {
          napi_get_reference_value(env_, jsFuncRef_, &fn);
        }
        callJsCb_(env_, fn, context_, queuedData);
      } else if (jsFuncRef_) {
        napi_value fn;
        napi_get_reference_value(env_, jsFuncRef_, &fn);
        napi_value recv;
        napi_get_undefined(env_, &recv);
        napi_value result;
        napi_call_function(env_, recv, fn, 0, nullptr, &result);
      }
    }

    // Auto-finalize when: no remaining threads (acquire/release balance),
    // queue drained, and not already closing.
    if (!threadCount_ && empty && !closing_) {
      if (maxQueueSize_) {
        std::lock_guard lock{queueMutex_};
        queueCv_.notify_all();
      }
      finalize();
    }
  });
  return napi_ok;
}

napi_status ThreadSafeFunction::acquire() {
  if (closing_) {
    return napi_closing;
  }
  refCount_++;
  threadCount_++;
  return napi_ok;
}

napi_status ThreadSafeFunction::release(
    napi_threadsafe_function_release_mode mode) {
  // Node-API semantics: abort prevents further JS calls and wakes any waiters.
  if (mode == napi_tsfn_abort) {
    aborted_ = true;
    closing_ = true;
  }
  if (refCount_) {
    refCount_--;
  }
  if (threadCount_) {
    threadCount_--;
  }
  // When the last ref is gone (or we're closing), queue is drained, notify and
  // finalize.
  std::lock_guard lock{queueMutex_};
  if (!refCount_ && !threadCount_ && queue_.empty() || closing_) {
    closing_ = true;
    if (maxQueueSize_) {
      queueCv_.notify_all();
    }
    finalize();
  }
  return napi_ok;
}

napi_status ThreadSafeFunction::ref() {
  // In libuv, this would keep the loop alive. In RN we don't own or expose a
  // libuv loop. We just track the state for API parity.
  referenced_.store(true, std::memory_order_relaxed);
  return napi_ok;
}

napi_status ThreadSafeFunction::unref() {
  // In libuv, this allows the loop to exit if nothing else is keeping it
  // alive. In RN this is a no-op beyond state tracking.
  referenced_.store(false, std::memory_order_relaxed);
  return napi_ok;
}

void ThreadSafeFunction::finalize() {
  std::lock_guard lock{finalizeMutex_};
  if (handlesClosing_) {
    return;
  }
  handlesClosing_ = true;
  closing_ = true;

  const auto onFinalize = [this] {
    // Invoke user finalizer and unregister the handle from the global map.
    if (threadFinalizeCb_) {
      threadFinalizeCb_(env_, threadFinalizeData_, context_);
    }
    std::lock_guard lock{registryMutex};
    registry.erase(reinterpret_cast<napi_threadsafe_function>(this));
  };

  // Prefer running the finalizer on the JS thread to match expectations;
  // if CallInvoker is gone, run synchronously.
  if (const auto invoker = callInvoker_.lock()) {
    invoker->invokeAsync([=]() { onFinalize(); });
  } else {
    onFinalize();
  }
}

}  // namespace callstack::nodeapihost
