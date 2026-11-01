cmake_minimum_required(VERSION 3.19)
project(node-api-stub)

set(NODE_API_STUB_LIBRARY_NAME "hermesvm" CACHE STRING "Name of the library the stub stands in for")

add_library(node-api-stub SHARED ${CMAKE_CURRENT_SOURCE_DIR}/../generated/node_api_stub.cpp)

target_include_directories(node-api-stub PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../include)
target_compile_definitions(node-api-stub PRIVATE NAPI_VERSION=10)

if(APPLE)
  set_target_properties(node-api-stub PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER com.callstack.node-api-stub.${NODE_API_STUB_LIBRARY_NAME}
    XCODE_ATTRIBUTE_SKIP_INSTALL NO
    OUTPUT_NAME ${NODE_API_STUB_LIBRARY_NAME}
  )
else()
  set_target_properties(node-api-stub PROPERTIES
    OUTPUT_NAME ${NODE_API_STUB_LIBRARY_NAME}
  )
endif()
