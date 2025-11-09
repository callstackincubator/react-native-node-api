#include "js_native_api_types.h"
#include "node_api.h"
#include "node_api_types.h"
#include <catch2/catch_test_macros.hpp>
#include <cstddef>
#include <memory>

#include <NodeApiHost.hpp>
#include <NodeApiMultiHost.hpp>
#include <weak_node_api.hpp>

TEST_CASE("NodeApiMultiHost") {
  SECTION("is injectable") {
    NodeApiMultiHost host{nullptr, nullptr};
    inject_weak_node_api_host(host);
  }

  SECTION("propagates calls to the right napi_create_object") {
    // Setup two hosts
    static size_t foo_calls = 0;
    auto host_foo = std::shared_ptr<NodeApiHost>(new NodeApiHost{
        .napi_create_object = [](napi_env env,
                                 napi_value *result) -> napi_status {
          foo_calls++;
          return napi_status::napi_ok;
        }});

    static size_t bar_calls = 0;
    auto host_bar = std::shared_ptr<NodeApiHost>(new NodeApiHost{
        .napi_create_object = [](napi_env env,
                                 napi_value *result) -> napi_status {
          bar_calls++;
          return napi_status::napi_ok;
        }});

    // Create and inject a multi host and wrap two envs
    NodeApiMultiHost multi_host{nullptr, nullptr};
    inject_weak_node_api_host(multi_host);

    auto foo_env = multi_host.wrap(napi_env{}, host_foo);
    auto bar_env = multi_host.wrap(napi_env{}, host_bar);

    napi_value result;

    REQUIRE(foo_calls == 0);
    REQUIRE(bar_calls == 0);

    REQUIRE(napi_create_object(foo_env, &result) == napi_ok);
    REQUIRE(foo_calls == 1);
    REQUIRE(bar_calls == 0);

    REQUIRE(napi_create_object(bar_env, &result) == napi_ok);
    REQUIRE(foo_calls == 1);
    REQUIRE(bar_calls == 1);
  }

  SECTION("handles multi-host resetting") {
    // Setup two hosts
    static size_t called = 0;
    auto host = std::shared_ptr<NodeApiHost>(new NodeApiHost{
        .napi_create_object = [](napi_env env,
                                 napi_value *result) -> napi_status {
          called++;
          return napi_status::napi_ok;
        }});

    // Create and inject a multi host and wrap two envs
    NodeApiMultiHost multi_host{nullptr, nullptr};
    inject_weak_node_api_host(multi_host);

    auto env = multi_host.wrap(napi_env{}, host);

    napi_value result;
    REQUIRE(called == 0);

    REQUIRE(napi_create_object(env, &result) == napi_ok);
    REQUIRE(called == 1);

    host.reset();
    REQUIRE(napi_create_object(env, &result) == napi_generic_failure);
    REQUIRE(called == 1);
  }

  SECTION("wraps threadsafe functions") {
    // Setup two hosts
    static size_t calls = 0;
    auto host_foo = std::shared_ptr<NodeApiHost>(new NodeApiHost{
        .napi_create_object = [](napi_env env,
                                 napi_value *result) -> napi_status {
          calls++;
          return napi_status::napi_ok;
        },
        .napi_create_threadsafe_function =
            [](napi_env, napi_value, napi_value, napi_value, size_t, size_t,
               void *, napi_finalize, void *, napi_threadsafe_function_call_js,
               napi_threadsafe_function *out) -> napi_status {
          calls++;
          (*out) = {};
          return napi_status::napi_ok;
        },
        .napi_release_threadsafe_function =
            [](napi_threadsafe_function,
               napi_threadsafe_function_release_mode) -> napi_status {
          calls++;
          return napi_status::napi_ok;
        }});

    // Create and inject a multi host and wrap two envs
    NodeApiMultiHost multi_host{nullptr, nullptr};
    inject_weak_node_api_host(multi_host);

    auto foo_env = multi_host.wrap(napi_env{}, host_foo);

    {
      napi_threadsafe_function result;

      REQUIRE(calls == 0);

      REQUIRE(napi_create_threadsafe_function(
                  foo_env, nullptr, nullptr, nullptr, 0, 0, nullptr, nullptr,
                  nullptr, nullptr, &result) == napi_ok);
      REQUIRE(calls == 1);

      REQUIRE(napi_release_threadsafe_function(
                  result,
                  napi_threadsafe_function_release_mode::napi_tsfn_release) ==
              napi_ok);
      REQUIRE(calls == 2);
    }
  }

  SECTION("wraps async cleanup hook handles") {
    // Setup two hosts
    static size_t calls = 0;
    auto host_foo = std::shared_ptr<NodeApiHost>(new NodeApiHost{
        .napi_create_object = [](napi_env env,
                                 napi_value *result) -> napi_status {
          calls++;
          return napi_status::napi_ok;
        },
        .napi_add_async_cleanup_hook =
            [](node_api_basic_env env, napi_async_cleanup_hook hook, void *arg,
               napi_async_cleanup_hook_handle *remove_handle) -> napi_status {
          calls++;
          (*remove_handle) = {};
          return napi_status::napi_ok;
        },
        .napi_remove_async_cleanup_hook =
            [](napi_async_cleanup_hook_handle remove_handle) -> napi_status {
          calls++;
          return napi_status::napi_ok;
        }});

    // Create and inject a multi host and wrap two envs
    NodeApiMultiHost multi_host{nullptr, nullptr};
    inject_weak_node_api_host(multi_host);

    auto foo_env = multi_host.wrap(napi_env{}, host_foo);

    {
      napi_async_cleanup_hook_handle result;

      REQUIRE(calls == 0);

      REQUIRE(napi_add_async_cleanup_hook(foo_env, nullptr, nullptr, &result) ==
              napi_ok);
      REQUIRE(calls == 1);

      REQUIRE(napi_remove_async_cleanup_hook(result) == napi_ok);
      REQUIRE(calls == 2);
    }
  }
}
