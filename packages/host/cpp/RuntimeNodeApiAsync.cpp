#include "RuntimeNodeApiAsync.hpp"
#include <ReactCommon/CallInvoker.h>
#include "Logger.hpp"
#include "ThreadsafeFunction.hpp"

struct AsyncJob {
  using IdType = uint64_t;
  enum State { Created, Queued, Completed, Cancelled, Deleted };

  IdType id{};
  State state{};
  napi_env env;
  napi_value async_resource;
  napi_value async_resource_name;
  napi_async_execute_callback execute;
  napi_async_complete_callback complete;
  void* data{nullptr};

  static AsyncJob* fromWork(napi_async_work work) {
    return reinterpret_cast<AsyncJob*>(work);
  }
  static napi_async_work toWork(AsyncJob* job) {
    return reinterpret_cast<napi_async_work>(job);
  }
};

class AsyncWorkRegistry {
 public:
  using IdType = AsyncJob::IdType;

  std::shared_ptr<AsyncJob> create(napi_env env,
      napi_value async_resource,
      napi_value async_resource_name,
      napi_async_execute_callback execute,
      napi_async_complete_callback complete,
      void* data) {
    const auto job = std::shared_ptr<AsyncJob>(new AsyncJob{
        .id = next_id(),
        .state = AsyncJob::State::Created,
        .env = env,
        .async_resource = async_resource,
        .async_resource_name = async_resource_name,
        .execute = execute,
        .complete = complete,
        .data = data,
    });

    jobs_[job->id] = job;
    return job;
  }

  std::shared_ptr<AsyncJob> get(napi_async_work work) const {
    const auto job = AsyncJob::fromWork(work);
    if (!job) {
      return {};
    }
    if (const auto it = jobs_.find(job->id); it != jobs_.end()) {
      return it->second;
    }
    return {};
  }

  bool release(IdType id) {
    if (const auto it = jobs_.find(id); it != jobs_.end()) {
      it->second->state = AsyncJob::State::Deleted;
      jobs_.erase(it);
      return true;
    }
    return false;
  }

 private:
  IdType next_id() {
    if (current_id_ == std::numeric_limits<IdType>::max()) [[unlikely]] {
      current_id_ = 0;
    }
    return ++current_id_;
  }

  IdType current_id_{0};
  std::unordered_map<IdType, std::shared_ptr<AsyncJob>> jobs_;
};

static std::unordered_map<napi_env, std::weak_ptr<facebook::react::CallInvoker>>
    callInvokers;
static AsyncWorkRegistry asyncWorkRegistry;

namespace callstack::nodeapihost {

void setCallInvoker(napi_env env,
    const std::shared_ptr<facebook::react::CallInvoker>& invoker) {
  callInvokers[env] = invoker;
}

std::weak_ptr<facebook::react::CallInvoker> getCallInvoker(napi_env env) {
  return callInvokers.contains(env)
             ? callInvokers[env]
             : std::weak_ptr<facebook::react::CallInvoker>{};
}

napi_status napi_create_async_work(napi_env env,
    napi_value async_resource,
    napi_value async_resource_name,
    napi_async_execute_callback execute,
    napi_async_complete_callback complete,
    void* data,
    napi_async_work* result) {
  const auto job = asyncWorkRegistry.create(
      env, async_resource, async_resource_name, execute, complete, data);
  if (!job) {
    log_debug("Error: Failed to create async work job");
    return napi_generic_failure;
  }

  *result = AsyncJob::toWork(job.get());
  return napi_ok;
}

napi_status napi_queue_async_work(
    node_api_basic_env env, napi_async_work work) {
  const auto job = asyncWorkRegistry.get(work);
  if (!job) {
    log_debug("Error: Received null job in napi_queue_async_work");
    return napi_invalid_arg;
  }

  const auto invoker = getCallInvoker(env).lock();
  if (!invoker) {
    log_debug("Error: No CallInvoker available for async work");
    return napi_invalid_arg;
  }

  invoker->invokeAsync([env, weakJob = std::weak_ptr{job}]() {
    const auto job = weakJob.lock();
    if (!job) {
      log_debug("Error: Async job has been deleted before execution");
      return;
    }
    if (job->state == AsyncJob::State::Queued) {
      job->execute(job->env, job->data);
    }

    job->complete(env,
        job->state == AsyncJob::State::Cancelled ? napi_cancelled : napi_ok,
        job->data);
    job->state = AsyncJob::State::Completed;
  });

  job->state = AsyncJob::State::Queued;
  return napi_ok;
}

napi_status napi_delete_async_work(
    node_api_basic_env env, napi_async_work work) {
  const auto job = asyncWorkRegistry.get(work);
  if (!job) {
    log_debug("Error: Received non-existent job in napi_delete_async_work");
    return napi_invalid_arg;
  }

  if (!asyncWorkRegistry.release(job->id)) {
    log_debug("Error: Failed to release async work job");
    return napi_generic_failure;
  }

  return napi_ok;
}

napi_status napi_cancel_async_work(
    node_api_basic_env env, napi_async_work work) {
  const auto job = asyncWorkRegistry.get(work);
  if (!job) {
    log_debug("Error: Received null job in napi_cancel_async_work");
    return napi_invalid_arg;
  }
  switch (job->state) {
    case AsyncJob::State::Completed:
      log_debug("Error: Cannot cancel async work that is already completed");
      return napi_generic_failure;
    case AsyncJob::State::Deleted:
      log_debug("Warning: Async work job is already deleted");
      return napi_generic_failure;
    case AsyncJob::State::Cancelled:
      log_debug("Warning: Async work job is already cancelled");
      return napi_ok;
  }

  job->state = AsyncJob::State::Cancelled;
  return napi_ok;
}

napi_status napi_create_threadsafe_function(napi_env env,
    napi_value func,
    napi_value async_resource,
    napi_value async_resource_name,
    size_t max_queue_size,
    size_t initial_thread_count,
    void* thread_finalize_data,
    napi_finalize thread_finalize_cb,
    void* context,
    napi_threadsafe_function_call_js call_js_cb,
    napi_threadsafe_function* result) {
  const auto function = ThreadSafeFunction::create(getCallInvoker(env),
      env,
      func,
      async_resource,
      async_resource_name,
      max_queue_size,
      initial_thread_count,
      thread_finalize_data,
      thread_finalize_cb,
      context,
      call_js_cb);
	*result = function->getHandle();
  return napi_ok;
}

napi_status napi_get_threadsafe_function_context(
    napi_threadsafe_function func, void** result) {
  const auto function = ThreadSafeFunction::get(func);
  if (!function) {
    return napi_invalid_arg;
  }
  return function->getContext(result);
}

napi_status napi_call_threadsafe_function(napi_threadsafe_function func,
    void* data,
    napi_threadsafe_function_call_mode is_blocking) {
  const auto function = ThreadSafeFunction::get(func);
  if (!function) {
    return napi_invalid_arg;
  }
  return function->call(data, is_blocking);
}

napi_status napi_acquire_threadsafe_function(napi_threadsafe_function func) {
  const auto function = ThreadSafeFunction::get(func);
  if (!function) {
    return napi_invalid_arg;
  }
  return function->acquire();
}

napi_status napi_release_threadsafe_function(
    napi_threadsafe_function func, napi_threadsafe_function_release_mode mode) {
  const auto function = ThreadSafeFunction::get(func);
  if (!function) {
    return napi_invalid_arg;
  }
  return function->release(mode);
}

napi_status napi_unref_threadsafe_function(
    node_api_basic_env env, napi_threadsafe_function func) {
  const auto function = ThreadSafeFunction::get(func);
  if (!function) {
    return napi_invalid_arg;
  }
  // RN has no libuv loop to unref; we only update internal state for parity.
  return function->unref();
}

napi_status napi_ref_threadsafe_function(
    node_api_basic_env env, napi_threadsafe_function func) {
  const auto function = ThreadSafeFunction::get(func);
  if (!function) {
    return napi_invalid_arg;
  }
  // RN has no libuv loop to ref; we only update internal state for parity.
  return function->ref();
}
}  // namespace callstack::nodeapihost
