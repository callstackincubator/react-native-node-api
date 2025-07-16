#pragma once

#include <ReactCommon/CallInvoker.h>
#include <memory>
#include "node_api.h"

namespace callstack::nodeapihost {
void setCallInvoker(
    const std::shared_ptr<facebook::react::CallInvoker>& invoker);

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
}  // namespace callstack::nodeapihost
