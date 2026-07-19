cmake_minimum_required(VERSION 3.19)
project(weak-node-api)

# Read version from package.json
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/package.json" PACKAGE_JSON)
string(JSON PACKAGE_VERSION GET ${PACKAGE_JSON} version)

add_library(${PROJECT_NAME} SHARED)

set(INCLUDE_DIR "include")
set(GENERATED_SOURCE_DIR "generated")

set(PUBLIC_HEADER_FILES
  ${GENERATED_SOURCE_DIR}/weak_node_api.hpp
  ${GENERATED_SOURCE_DIR}/NodeApiHost.hpp
  ${INCLUDE_DIR}/js_native_api_types.h
  ${INCLUDE_DIR}/js_native_api.h
  ${INCLUDE_DIR}/node_api_types.h
  ${INCLUDE_DIR}/node_api.h
)

target_sources(${PROJECT_NAME}
  PUBLIC
    ${GENERATED_SOURCE_DIR}/weak_node_api.cpp
)

# Expose the public headers to consumers within the build tree (e.g. the tests)
# regardless of how they are packaged below.
target_include_directories(${PROJECT_NAME}
  PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/${GENERATED_SOURCE_DIR}>
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/${INCLUDE_DIR}>
)

# Stripping the prefix from the library name
# to make sure the name of the XCFramework will match the name of the library
if(APPLE)
  # Frameworks ship their public headers via the PUBLIC_HEADER property.
  set_target_properties(${PROJECT_NAME} PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER com.callstack.${PROJECT_NAME}
    MACOSX_FRAMEWORK_SHORT_VERSION_STRING ${PACKAGE_VERSION}
    MACOSX_FRAMEWORK_BUNDLE_VERSION ${PACKAGE_VERSION}
    VERSION ${PACKAGE_VERSION}
    XCODE_ATTRIBUTE_SKIP_INSTALL NO
    PUBLIC_HEADER "${PUBLIC_HEADER_FILES}"
  )
else()
  # Elsewhere, ship the public headers via a HEADERS file set for install packaging.
  target_sources(${PROJECT_NAME}
    PUBLIC FILE_SET HEADERS
    BASE_DIRS ${GENERATED_SOURCE_DIR} ${INCLUDE_DIR} FILES
      ${PUBLIC_HEADER_FILES}
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
