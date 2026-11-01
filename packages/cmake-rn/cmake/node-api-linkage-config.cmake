# Defines the `node-api-linkage` target, which links whatever cmake-rn's
# --node-api-linkage selected (NODE_API_LINKAGE).

if(TARGET node-api-linkage)
  return()
endif()

foreach(variable NODE_API_LINKAGE NODE_API_LINKAGE_LIB NODE_API_LINKAGE_INC)
  if(NOT DEFINED ${variable})
    message(FATAL_ERROR "${variable} is not set: build with cmake-rn and a --node-api-linkage other than 'none'")
  endif()
endforeach()

message(STATUS "Linking Node-API against ${NODE_API_LINKAGE}: ${NODE_API_LINKAGE_LIB}")

add_library(node-api-linkage SHARED IMPORTED)

set_target_properties(node-api-linkage PROPERTIES
  IMPORTED_LOCATION "${NODE_API_LINKAGE_LIB}"
  INTERFACE_INCLUDE_DIRECTORIES "${NODE_API_LINKAGE_INC}"
)
