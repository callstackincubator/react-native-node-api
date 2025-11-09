cmake_minimum_required(VERSION 3.19)
project(weak-node-api)

# Read version from package.json
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/package.json" PACKAGE_JSON)
string(JSON PACKAGE_VERSION GET ${PACKAGE_JSON} version)

add_library(${PROJECT_NAME} SHARED)

set(INCLUDE_DIR "include")
set(GENERATED_SOURCE_DIR "generated")

target_sources(${PROJECT_NAME}
  PUBLIC
    ${GENERATED_SOURCE_DIR}/weak_node_api.cpp
    ${GENERATED_SOURCE_DIR}/NodeApiMultiHost.cpp
  PUBLIC FILE_SET HEADERS
  BASE_DIRS ${GENERATED_SOURCE_DIR} ${INCLUDE_DIR} FILES
    ${GENERATED_SOURCE_DIR}/weak_node_api.hpp
    ${GENERATED_SOURCE_DIR}/NodeApiHost.hpp
    ${GENERATED_SOURCE_DIR}/NodeApiMultiHost.hpp
    ${INCLUDE_DIR}/js_native_api_types.h
    ${INCLUDE_DIR}/js_native_api.h
    ${INCLUDE_DIR}/node_api_types.h
    ${INCLUDE_DIR}/node_api.h
)

get_target_property(PUBLIC_HEADER_FILES ${PROJECT_NAME} HEADER_SET)

# Stripping the prefix from the library name
# to make sure the name of the XCFramework will match the name of the library
if(APPLE)
  set_target_properties(${PROJECT_NAME} PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER com.callstack.${PROJECT_NAME}
    MACOSX_FRAMEWORK_SHORT_VERSION_STRING ${PACKAGE_VERSION}
    MACOSX_FRAMEWORK_BUNDLE_VERSION ${PACKAGE_VERSION}
    VERSION ${PACKAGE_VERSION}
    XCODE_ATTRIBUTE_SKIP_INSTALL NO
    PUBLIC_HEADER "${PUBLIC_HEADER_FILES}"
  )
endif()

# C++20 is needed to use designated initializers
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_20)
target_compile_definitions(${PROJECT_NAME} PRIVATE NAPI_VERSION=8)

target_compile_options(${PROJECT_NAME} PRIVATE
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /WX>
  $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -Werror>
)

option(BUILD_TESTS "Build the tests" OFF)
if(BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
