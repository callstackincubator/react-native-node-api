# Defines the `node-api` target, linking what cmake-rn's --node-api-linkage
# selected (NODE_API_LINKAGE).

if(TARGET node-api)
  return()
endif()

foreach(variable NODE_API_LINKAGE NODE_API_INC)
  if(NOT DEFINED ${variable})
    message(FATAL_ERROR "${variable} is not set: build with cmake-rn and a --node-api-linkage other than 'none'")
  endif()
endforeach()

if(NODE_API_LINKAGE STREQUAL "hermes")
  if(NOT TARGET node-api-stub)
    add_subdirectory("${NODE_API_STUB_DIR}" "${CMAKE_BINARY_DIR}/node-api-stub")
  endif()
  add_library(node-api INTERFACE)
  target_link_libraries(node-api INTERFACE node-api-stub)
  target_include_directories(node-api INTERFACE ${NODE_API_INC})
  message(STATUS "Linking Node-API against a stub of Hermes")
else()
  if(NOT DEFINED NODE_API_LIB)
    message(FATAL_ERROR "NODE_API_LIB is not set")
  endif()
  add_library(node-api SHARED IMPORTED)
  set_target_properties(node-api PROPERTIES
    IMPORTED_LOCATION "${NODE_API_LIB}"
    INTERFACE_INCLUDE_DIRECTORIES "${NODE_API_INC}"
  )
  message(STATUS "Linking Node-API against ${NODE_API_LINKAGE}: ${NODE_API_LIB}")
endif()
