cmake_minimum_required(VERSION 3.15)
project(tests-threadsafe_function)

add_compile_definitions(NAPI_VERSION=8)

add_library(addon SHARED addon.cpp ${CMAKE_JS_SRC})
set_target_properties(addon PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(addon PRIVATE "/Users/kamil.paradowski/projects/napi/node_modules/node-addon-api" ${CMAKE_JS_INC})
target_link_libraries(addon PRIVATE ${CMAKE_JS_LIB})
target_compile_features(addon PRIVATE cxx_std_17)
target_compile_definitions(addon PRIVATE NAPI_DISABLE_CPP_EXCEPTIONS)

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()