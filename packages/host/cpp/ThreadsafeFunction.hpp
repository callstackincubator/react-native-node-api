#pragma once

#include <ReactCommon/CallInvoker.h>
#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <queue>
#include "node_api.h"

namespace callstack::nodeapihost {
class ThreadSafeFunction
    : public std::enable_shared_from_this<ThreadSafeFunction> {
 public:
  ThreadSafeFunction(std::weak_ptr<facebook::react::CallInvoker> callInvoker,
      napi_env env,
      napi_value jsFunc,
      napi_value asyncResource,
      napi_value asyncResourceName,
      size_t maxQueueSize,
      size_t initialThreadCount,
      void* threadFinalizeData,
      napi_finalize threadFinalizeCb,
      void* context,
      napi_threadsafe_function_call_js callJsCb);
  ~ThreadSafeFunction();

  static std::shared_ptr<ThreadSafeFunction> create(
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
      napi_threadsafe_function_call_js callJsCb);

  static std::shared_ptr<ThreadSafeFunction> get(napi_threadsafe_function func);

  [[nodiscard]] napi_threadsafe_function getHandle() const noexcept;
  [[nodiscard]] napi_status getContext(void** result) noexcept;
  [[nodiscard]] napi_status call(
      void* data, napi_threadsafe_function_call_mode isBlocking);
  [[nodiscard]] napi_status acquire();
  [[nodiscard]] napi_status release(napi_threadsafe_function_release_mode mode);
  // Node-API compatibility: These do not affect RN's lifecycle. We only track
  // the state for diagnostics and API parity with libuv's ref/unref.
  [[nodiscard]] napi_status ref() noexcept;
  [[nodiscard]] napi_status unref() noexcept;

 private:
  void finalize();
  void processQueue();

  [[nodiscard]] bool isClosingOrAborted() const noexcept;
  [[nodiscard]] bool shouldFinalize() const noexcept;

  const std::uintptr_t id_;
  const size_t maxQueueSize_;

  std::atomic<size_t> threadCount_;
  std::atomic<bool> aborted_{false};
  std::atomic<bool> closing_{false};
  std::atomic<bool> referenced_{true};
  std::atomic<bool> finalizeScheduled_{false};

  mutable std::mutex queueMutex_;
  std::condition_variable queueCv_;
  std::queue<void*> queue_;

  napi_env env_;
  napi_value jsFunc_;
  napi_ref jsFuncRef_{nullptr};
  napi_value asyncResource_;
  napi_value asyncResourceName_;

  void* const threadFinalizeData_;
  napi_finalize const threadFinalizeCb_;
  void* const context_;
  napi_threadsafe_function_call_js const callJsCb_;

  std::weak_ptr<facebook::react::CallInvoker> callInvoker_;
};

}  // namespace callstack::nodeapihost
