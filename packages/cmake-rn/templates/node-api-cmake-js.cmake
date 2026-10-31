# Set by cmake-js, and by cmake-rn when passed --cmake-js
add_library({{name}} SHARED src/addon.c ${CMAKE_JS_SRC})
target_include_directories({{name}} PRIVATE ${CMAKE_JS_INC})
target_link_libraries({{name}} PRIVATE ${CMAKE_JS_LIB})

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

