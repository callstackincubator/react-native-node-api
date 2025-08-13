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

  [[nodiscard]] napi_status getContext(void** result);
  [[nodiscard]] napi_status call(
      void* data, napi_threadsafe_function_call_mode isBlocking);
  [[nodiscard]] napi_status acquire();
  [[nodiscard]] napi_status release(napi_threadsafe_function_release_mode mode);
  // Node-API compatibility: These do not affect RN's lifecycle. We only track
  // the state for diagnostics and API parity with libuv's ref/unref.
  [[nodiscard]] napi_status ref();
  [[nodiscard]] napi_status unref();

 private:
  void finalize();

  std::weak_ptr<facebook::react::CallInvoker> callInvoker_;
  napi_env env_;
  napi_value jsFunc_;
  napi_ref jsFuncRef_{nullptr};
  napi_value asyncResource_;
  napi_value asyncResourceName_;
  size_t maxQueueSize_;
  std::atomic<size_t> threadCount_;
  std::atomic<bool> aborted_{false};
  void* threadFinalizeData_;
  napi_finalize threadFinalizeCb_;
  void* context_;
  napi_threadsafe_function_call_js callJsCb_;
  std::mutex queueMutex_;
  std::condition_variable queueCv_;
  std::queue<void*> queue_;
  std::atomic<bool> closing_{false};
  std::atomic<bool> referenced_{true};
  std::atomic<bool> finalizeScheduled_{false};
};

}  // namespace callstack::nodeapihost
