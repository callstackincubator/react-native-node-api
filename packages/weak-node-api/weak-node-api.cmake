if(NOT DEFINED WEAK_NODE_API_LIB)
    # TODO: Set this to an Android and Apple specific path to the dynamic library
    message(FATAL_ERROR "WEAK_NODE_API_LIB is not set")
endif()

if(NOT DEFINED WEAK_NODE_API_INC)
    # TODO: Set this to ./include and ./generated
    message(FATAL_ERROR "WEAK_NODE_API_INC is not set")
endif()

add_library(weak-node-api SHARED IMPORTED)

set_target_properties(weak-node-api PROPERTIES
    IMPORTED_LOCATION "${WEAK_NODE_API_LIB}"
    INTERFACE_INCLUDE_DIRECTORIES "${WEAK_NODE_API_INC}"
)
