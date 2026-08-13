#include <node_api.h>

// This addon registers itself the deprecated way — a napi_module_register call
// made while the library loads — and deliberately exports no
// napi_register_module_v1 symbol, so a host that only looks for that symbol
// cannot load it.
//
// The constructor is hand-rolled because node_api.h no longer offers a macro
// that emits one: NAPI_MODULE_X is now an alias of the symbol-based
// NAPI_MODULE.

static napi_value Registration(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result;
  if (napi_create_string_utf8(env, "napi_module_register", NAPI_AUTO_LENGTH,
                              &result) != napi_ok) {
    return NULL;
  }
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"registration", NULL, Registration, NULL, NULL, NULL, napi_default,
       NULL},
  };
  if (napi_define_properties(env, exports,
                             sizeof(properties) / sizeof(properties[0]),
                             properties) != napi_ok) {
    return NULL;
  }
  return exports;
}

static napi_module addon_module = {
    NAPI_MODULE_VERSION, 0,    __FILE__, Init, "module-register-test",
    NULL,                {0},
};

__attribute__((constructor)) static void RegisterAddon(void) {
  napi_module_register(&addon_module);
}
