#pragma once

#include <ReactCommon/CallInvoker.h>
#include <memory>
#include "node_api.h"

namespace callstack::nodeapihost {
void setCallInvoker(
    napi_env env, const std::shared_ptr<facebook::react::CallInvoker>& invoker);

napi_status napi_create_async_work(napi_env env,
    napi_value async_resource,
    napi_value async_resource_name,
    napi_async_execute_callback execute,
    napi_async_complete_callback complete,
    void* data,
    napi_async_work* result);

napi_status napi_queue_async_work(node_api_basic_env env, napi_async_work work);

napi_status napi_delete_async_work(
    node_api_basic_env env, napi_async_work work);

napi_status napi_cancel_async_work(
    node_api_basic_env env, napi_async_work work);

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
    napi_threadsafe_function* result);

napi_status napi_get_threadsafe_function_context(
    napi_threadsafe_function func, void** result);

napi_status napi_call_threadsafe_function(napi_threadsafe_function func,
    void* data,
    napi_threadsafe_function_call_mode is_blocking);

napi_status napi_acquire_threadsafe_function(napi_threadsafe_function func);

napi_status napi_release_threadsafe_function(
    napi_threadsafe_function func, napi_threadsafe_function_release_mode mode);

napi_status napi_unref_threadsafe_function(
    node_api_basic_env env, napi_threadsafe_function func);

napi_status napi_ref_threadsafe_function(
    node_api_basic_env env, napi_threadsafe_function func);
}  // namespace callstack::nodeapihost
