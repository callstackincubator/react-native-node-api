cmake_minimum_required(VERSION 3.15)
project(examples-1-getting-started-2_function_arguments_twisted-napi)

add_compile_definitions(-DNAPI_VERSION=4)

add_library(addon_twisted SHARED addon.c ${CMAKE_JS_SRC})
set_target_properties(addon_twisted PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(addon_twisted PRIVATE  ${CMAKE_JS_INC})
target_link_libraries(addon_twisted PRIVATE ${CMAKE_JS_LIB})
target_compile_features(addon_twisted PRIVATE cxx_std_17)

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()
