cmake_minimum_required(VERSION 3.19)
project(node-api-stub)

set(NODE_API_STUB_LIBRARY_NAME "hermesvm" CACHE STRING "Name of the library the stub stands in for")

if(NOT DEFINED NODE_API_INC)
  message(FATAL_ERROR "NODE_API_INC must point at the Node-API headers")
endif()

add_library(node-api-stub SHARED EXCLUDE_FROM_ALL ${CMAKE_CURRENT_LIST_DIR}/generated/node_api_stub.cpp)

target_include_directories(node-api-stub PRIVATE ${NODE_API_INC})
target_compile_definitions(node-api-stub PRIVATE NAPI_VERSION=10)

if(APPLE)
  set_target_properties(node-api-stub PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER com.callstack.node-api-stub.${NODE_API_STUB_LIBRARY_NAME}
    OUTPUT_NAME ${NODE_API_STUB_LIBRARY_NAME}
  )
else()
  set_target_properties(node-api-stub PROPERTIES
    OUTPUT_NAME ${NODE_API_STUB_LIBRARY_NAME}
  )
endif()
