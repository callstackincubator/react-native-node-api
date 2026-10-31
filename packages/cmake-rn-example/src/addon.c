#include <node_api.h>

#define NAPI_CALL(env, call)                                                   \
  do {                                                                         \
    if ((call) != napi_ok) {                                                   \
      napi_throw_error((env), NULL, "Failed to call " #call);                  \
      return NULL;                                                             \
    }                                                                          \
  } while (0)

static napi_value Sum(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  NAPI_CALL(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL));

  // Missing arguments are undefined, which isn't a number either
  double a;
  double b;
  if (napi_get_value_double(env, args[0], &a) != napi_ok ||
      napi_get_value_double(env, args[1], &b) != napi_ok) {
    napi_throw_type_error(env, NULL, "Expected two numbers");
    return NULL;
  }

  napi_value result;
  NAPI_CALL(env, napi_create_double(env, a + b, &result));
  return result;
}

NAPI_MODULE_INIT() {
  napi_value sum;
  NAPI_CALL(env,
            napi_create_function(env, "sum", NAPI_AUTO_LENGTH, Sum, NULL, &sum));
  NAPI_CALL(env, napi_set_named_property(env, exports, "sum", sum));
  return exports;
}
