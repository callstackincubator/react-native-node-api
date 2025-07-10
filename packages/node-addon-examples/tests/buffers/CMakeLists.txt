cmake_minimum_required(VERSION 3.15)
project(tests-buffers)

add_compile_definitions(NAPI_VERSION=8)

add_library(addon SHARED addon.c ${CMAKE_JS_SRC})
set_target_properties(addon PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(addon PRIVATE  ${CMAKE_JS_INC})
target_link_libraries(addon PRIVATE ${CMAKE_JS_LIB})
target_compile_features(addon PRIVATE cxx_std_17)

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()
