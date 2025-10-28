cmake_minimum_required(VERSION 3.15...3.31)
project(buffers-test)

include(${WEAK_NODE_API_CONFIG})

add_library(addon SHARED addon.c)

option(BUILD_APPLE_FRAMEWORK "Wrap addon in an Apple framework" ON)

if(APPLE AND BUILD_APPLE_FRAMEWORK)
  set_target_properties(addon PROPERTIES
    FRAMEWORK TRUE
    MACOSX_FRAMEWORK_IDENTIFIER buffers-test.addon
    MACOSX_FRAMEWORK_SHORT_VERSION_STRING 1.0
    MACOSX_FRAMEWORK_BUNDLE_VERSION 1.0
    XCODE_ATTRIBUTE_SKIP_INSTALL NO
   )
else()
  set_target_properties(addon PROPERTIES
    PREFIX ""
    SUFFIX .node
   )
endif()

target_link_libraries(addon PRIVATE weak-node-api)
target_compile_features(addon PRIVATE cxx_std_17)