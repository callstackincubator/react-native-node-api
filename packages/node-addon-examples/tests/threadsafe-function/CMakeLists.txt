cmake_minimum_required(VERSION 3.15...3.31)
project(threadsafe-function-test)

find_package(weak-node-api REQUIRED CONFIG)

add_library(threadsafe-function-test-addon SHARED addon.c)

option(BUILD_APPLE_FRAMEWORK "Wrap addon in an Apple framework" ON)

if(APPLE AND BUILD_APPLE_FRAMEWORK)
  set_target_properties(threadsafe-function-test-addon PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER threadsafe-function-test.addon
    MACOSX_FRAMEWORK_SHORT_VERSION_STRING 1.0
    MACOSX_FRAMEWORK_BUNDLE_VERSION 1.0
    XCODE_ATTRIBUTE_SKIP_INSTALL NO
    OUTPUT_NAME addon
   )
else()
  set_target_properties(threadsafe-function-test-addon PROPERTIES
    PREFIX ""
    SUFFIX .node
    OUTPUT_NAME addon
   )
endif()

target_link_libraries(threadsafe-function-test-addon PRIVATE weak-node-api)
target_compile_features(threadsafe-function-test-addon PRIVATE cxx_std_17)