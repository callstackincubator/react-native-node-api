#include <node_api.h>

static napi_value Sum(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, NULL, NULL);

  double a, b;
  if (napi_get_value_double(env, args[0], &a) != napi_ok ||
      napi_get_value_double(env, args[1], &b) != napi_ok) {
    napi_throw_type_error(env, NULL, "Expected two numbers");
    return NULL;
  }

  napi_value result;
  napi_create_double(env, a + b, &result);
  return result;
}

NAPI_MODULE_INIT() {
  napi_value sum;
  napi_create_function(env, "sum", NAPI_AUTO_LENGTH, Sum, NULL, &sum);
  napi_set_named_property(env, exports, "sum", sum);
  return exports;
}
