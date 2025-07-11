#include "RuntimeNodeApi.hpp"
#include <string>

auto ArrayType = napi_uint8_array;

napi_status NAPI_CDECL callstack::nodeapihost::napi_create_buffer(
    napi_env env, size_t length, void** data, napi_value* result) {
  napi_value buffer;
  const auto status = napi_create_arraybuffer(env, length, data, &buffer);
  if (status != napi_ok) {
    return status;
  }

  return napi_create_typedarray(env, ArrayType, length, buffer, 0, result);
}

napi_status NAPI_CDECL callstack::nodeapihost::napi_create_buffer_copy(
    napi_env env,
    size_t length,
    const void* data,
    void** result_data,
    napi_value* result) {
  if (!length || !data || !result) {
    return napi_invalid_arg;
  }

  void* buffer = nullptr;
  if (const auto status = ::napi_create_buffer(env, length, &buffer, result);
      status != napi_ok) {
    return status;
  }

  std::memcpy(buffer, data, length);
  return napi_ok;
}

napi_status callstack::nodeapihost::napi_is_buffer(
    napi_env env, napi_value value, bool* result) {
  if (!result) {
    return napi_invalid_arg;
  }

  if (!value) {
    *result = false;
    return napi_ok;
  }

  napi_valuetype type{};
  if (const auto status = napi_typeof(env, value, &type); status != napi_ok) {
    return status;
  }

  if (type != napi_object && type != napi_external) {
    *result = false;
    return napi_ok;
  }

  auto isArrayBuffer{false};
  if (const auto status = napi_is_arraybuffer(env, value, &isArrayBuffer);
      status != napi_ok) {
    return status;
  }
  auto isTypedArray{false};
  if (const auto status = napi_is_typedarray(env, value, &isTypedArray);
      status != napi_ok) {
    return status;
  }

  *result = isArrayBuffer || isTypedArray;
  return napi_ok;
}

napi_status callstack::nodeapihost::napi_get_buffer_info(
    napi_env env, napi_value value, void** data, size_t* length) {
  if (!data || !length) {
    return napi_invalid_arg;
  }
  *data = nullptr;
  *length = 0;
  if (!value) {
    return napi_ok;
  }

  auto isArrayBuffer{false};
  if (const auto status = napi_is_arraybuffer(env, value, &isArrayBuffer);
      status == napi_ok && isArrayBuffer) {
    return napi_get_arraybuffer_info(env, value, data, length);
  }

  auto isTypedArray{false};
  if (const auto status = napi_is_typedarray(env, value, &isTypedArray);
      status == napi_ok && isTypedArray) {
    return napi_get_typedarray_info(
        env, value, &ArrayType, length, data, nullptr, nullptr);
  }

  return napi_ok;
}

napi_status callstack::nodeapihost::napi_create_external_buffer(napi_env env,
    size_t length,
    void* data,
    node_api_basic_finalize basic_finalize_cb,
    void* finalize_hint,
    napi_value* result) {
  return napi_create_external_arraybuffer(
      env, data, length, basic_finalize_cb, finalize_hint, result);
}
