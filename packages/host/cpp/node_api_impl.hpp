#include "node_api.h"

namespace callstack::nodeapihost {
napi_status napi_create_buffer(
    napi_env env, size_t length, void** data, napi_value* result);

napi_status napi_create_buffer_copy(napi_env env,
    size_t length,
    const void* data,
    void** result_data,
    napi_value* result);

napi_status napi_is_buffer(napi_env env, napi_value value, bool* result);

napi_status napi_get_buffer_info(
    napi_env env, napi_value value, void** data, size_t* length);

napi_status napi_create_external_buffer(napi_env env,
    size_t length,
    void* data,
    node_api_basic_finalize basic_finalize_cb,
    void* finalize_hint,
    napi_value* result);

}  // namespace callstack::nodeapihost
