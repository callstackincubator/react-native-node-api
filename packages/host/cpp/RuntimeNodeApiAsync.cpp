#include "RuntimeNodeApiAsync.hpp"
#include <ReactCommon/CallInvoker.h>
#include "Logger.hpp"

using IdType = uint64_t;

struct AsyncContext {
  IdType id{};
  napi_env env;
  napi_value async_resource;
  napi_value async_resource_name;

  AsyncContext(
      napi_env env, napi_value async_resource, napi_value async_resource_name)
      : env{env},
        async_resource{async_resource},
        async_resource_name{async_resource_name} {}
};

struct AsyncJob : AsyncContext {
  enum State { Created, Queued, Completed, Cancelled, Deleted };

  State state{State::Created};
  napi_async_execute_callback execute;
  napi_async_complete_callback complete;
  void* data{nullptr};

  AsyncJob(napi_env env,
      napi_value async_resource,
      napi_value async_resource_name,
      napi_async_execute_callback execute,
      napi_async_complete_callback complete,
      void* data)
      : AsyncContext{env, async_resource, async_resource_name},
        execute{execute},
        complete{complete},
        data{data} {}
};

template <class T, class U>
class Container {
 public:
  void push(std::shared_ptr<T>&& obj) {
    const auto id = nextId();
    obj->id = id;
    map_[id] = std::move(obj);
  }
  std::shared_ptr<T> get(const U obj) {
    return map_.contains(id(obj)) ? map_[id(obj)] : nullptr;
  }
  bool release(const U obj) { return map_.erase(id(obj)) > 0; }

 private:
  IdType id(const U obj) const {
    auto casted = reinterpret_cast<T*>(obj);
    return casted ? casted->id : 0;
  }
  IdType nextId() {
    if (currentId_ == std::numeric_limits<IdType>::max()) [[unlikely]] {
      currentId_ = 0;
    }
    return ++currentId_;
  }

  IdType currentId_{0};
  std::unordered_map<IdType, std::shared_ptr<T>> map_;
};

static std::unordered_map<napi_env, std::weak_ptr<facebook::react::CallInvoker>>
    callInvokers;
static Container<AsyncJob, napi_async_work> jobs_;
static Container<AsyncContext, napi_async_context> contexts_;

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
  auto job = std::make_shared<AsyncJob>(
      env, async_resource, async_resource_name, execute, complete, data);
  *result = reinterpret_cast<napi_async_work>(job.get());
  jobs_.push(std::move(job));
  return napi_ok;
}

napi_status napi_queue_async_work(
    node_api_basic_env env, napi_async_work work) {
  const auto job = jobs_.get(work);
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
  const auto job = jobs_.get(work);
  if (!job) {
    log_debug("Error: Received non-existent job in napi_delete_async_work");
    return napi_invalid_arg;
  }

  job->state = AsyncJob::State::Deleted;
  if (!jobs_.release(work)) {
    log_debug("Error: Failed to release async work job");
    return napi_generic_failure;
  }

  return napi_ok;
}

napi_status napi_cancel_async_work(
    node_api_basic_env env, napi_async_work work) {
  const auto job = jobs_.get(work);
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

napi_status napi_async_init(napi_env env,
    napi_value async_resource,
    napi_value async_resource_name,
    napi_async_context* result) {
  if (!result) {
    return napi_invalid_arg;
  }
  auto context =
      std::make_shared<AsyncContext>(env, async_resource, async_resource_name);
  *result = reinterpret_cast<napi_async_context>(context.get());
  contexts_.push(std::move(context));
  return napi_ok;
}

napi_status napi_async_destroy(napi_env env, napi_async_context async_context) {
  if (!async_context) {
    return napi_invalid_arg;
  }
  if (!contexts_.release(async_context)) {
    return napi_generic_failure;
  }
  return napi_ok;
}

napi_status napi_make_callback(napi_env env,
    napi_async_context async_context,
    napi_value recv,
    napi_value func,
    size_t argc,
    const napi_value* argv,
    napi_value* result) {
  const auto status = napi_call_function(env, recv, func, argc, argv, result);
  if (status == napi_pending_exception && async_context) {
    contexts_.release(async_context);
  }
  return status;
}
}  // namespace callstack::nodeapihost
