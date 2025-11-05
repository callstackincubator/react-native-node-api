Include(FetchContent)

FetchContent_Declare(
  Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG v3.11.0
)

FetchContent_MakeAvailable(Catch2)

add_executable(weak-node-api-tests
  test_inject.cpp
)
target_link_libraries(weak-node-api-tests
  PRIVATE
    weak-node-api
    Catch2::Catch2WithMain
)

# As per https://github.com/catchorg/Catch2/blob/devel/docs/cmake-integration.md#catchcmake-and-catchaddtestscmake
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
include(CTest)
include(Catch)
catch_discover_tests(weak-node-api-tests)
