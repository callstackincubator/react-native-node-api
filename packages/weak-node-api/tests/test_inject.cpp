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
