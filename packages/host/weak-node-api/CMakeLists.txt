cmake_minimum_required(VERSION 3.15)
project(weak-node-api)

add_library(${PROJECT_NAME} SHARED
  weak_node_api.cpp
)

# Stripping the prefix from the library name
# to make sure the name of the XCFramework will match the name of the library
if(APPLE)
  set_target_properties(${PROJECT_NAME} PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER com.callstack.${PROJECT_NAME}
    MACOSX_FRAMEWORK_SHORT_VERSION_STRING 1.0
    MACOSX_FRAMEWORK_BUNDLE_VERSION 1.0
    XCODE_ATTRIBUTE_SKIP_INSTALL NO
  )
endif()

target_include_directories(${PROJECT_NAME}
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_17)
target_compile_definitions(${PROJECT_NAME} PRIVATE NAPI_VERSION=8)

target_compile_options(${PROJECT_NAME} PRIVATE
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /WX>
  $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -Werror>
)
