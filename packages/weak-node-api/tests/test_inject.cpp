#include <catch2/catch_test_macros.hpp>
#include <weak_node_api.hpp>

TEST_CASE("inject_weak_node_api_host") {
  SECTION("is callable") {
    NodeApiHost host{};
    inject_weak_node_api_host(host);
  }

  SECTION("propagates calls to napi_create_object") {
    static bool called = false;
    auto my_create_object = [](napi_env env,
                               napi_value *result) -> napi_status {
      called = true;
      return napi_status::napi_ok;
    };
    NodeApiHost host{.napi_create_object = my_create_object};
    inject_weak_node_api_host(host);

    napi_value result;
    napi_create_object({}, &result);

    REQUIRE(called);
  }
}

TEST_CASE("calling into host from functions") {
  auto my_create_function = [](napi_env arg0, const char *arg1, size_t arg2,
                               napi_callback arg3, void *arg4,
                               napi_value *arg5) -> napi_status {
    // This is a failing noop as we're not actually creating a JS functions
    return napi_status::napi_generic_failure;
  };
  NodeApiHost host{.napi_create_function = my_create_function};
  inject_weak_node_api_host(host);
  napi_env raw_env{};

  SECTION("via global function") {
    napi_value result;
    napi_callback cb = [](napi_env env, napi_callback_info info) -> napi_value {
      napi_value obj;
      napi_status status = napi_create_object(env, &obj);
      return obj;
    };

    napi_create_function(raw_env, "foo", 3, cb, nullptr, &result);
  }

  SECTION("via callback info") {
    napi_value result;
    napi_callback cb = [](napi_env env, napi_callback_info info) -> napi_value {
      // Get host via callback info
      void *data;
      napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &data);
      auto *host_ptr = static_cast<decltype(&host)>(data);

      napi_value obj;
      napi_status status = host_ptr->napi_create_object(env, &obj);
      return obj;
    };

    napi_create_function(raw_env, "foo", 3, cb, &host, &result);
  }
}