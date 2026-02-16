cmake_minimum_required(VERSION 3.15...3.31)
project(async-test)

find_package(weak-node-api REQUIRED CONFIG)

add_library(async-test-addon SHARED addon.c)

option(BUILD_APPLE_FRAMEWORK "Wrap addon in an Apple framework" ON)

if(APPLE AND BUILD_APPLE_FRAMEWORK)
  set_target_properties(async-test-addon PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER async-test.addon
    MACOSX_FRAMEWORK_SHORT_VERSION_STRING 1.0
    MACOSX_FRAMEWORK_BUNDLE_VERSION 1.0
    XCODE_ATTRIBUTE_SKIP_INSTALL NO
   )
else()
  set_target_properties(async-test-addon PROPERTIES
    PREFIX ""
    SUFFIX .node
    OUTPUT_NAME addon
   )
endif()

target_link_libraries(async-test-addon PRIVATE weak-node-api)
target_compile_features(async-test-addon PRIVATE cxx_std_17)