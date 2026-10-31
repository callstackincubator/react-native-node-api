cmake_minimum_required(VERSION 3.19)
project(react-native-node-api-host-tests)

find_package(Threads REQUIRED)

# Build weak-node-api from source for the host platform: it provides the
# node_api.h headers HermesNapiHost.hpp needs and the napi_* symbols the
# fatal-exception path references at link time. Requires the generated sources
# from `pnpm --filter weak-node-api run prebuild:prepare`.
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../../weak-node-api weak-node-api)

Include(FetchContent)

FetchContent_Declare(
  Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG v3.11.0
)

FetchContent_MakeAvailable(Catch2)

add_executable(node-api-host-tests
  test_hermes_napi_host.cpp
  ../cpp/HermesNapiHost.cpp
  ../cpp/Logger.cpp
)
target_include_directories(node-api-host-tests PRIVATE ../cpp)
target_link_libraries(node-api-host-tests
  PRIVATE
    weak-node-api
    Catch2::Catch2WithMain
    Threads::Threads
)

target_compile_features(node-api-host-tests PRIVATE cxx_std_20)
target_compile_definitions(node-api-host-tests PRIVATE NAPI_VERSION=10)

# As per https://github.com/catchorg/Catch2/blob/devel/docs/cmake-integration.md#catchcmake-and-catchaddtestscmake
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
include(CTest)
include(Catch)
catch_discover_tests(node-api-host-tests)
