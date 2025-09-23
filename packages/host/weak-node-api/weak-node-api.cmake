add_library(weak-node-api SHARED IMPORTED)

set_target_properties(weak-node-api PROPERTIES
    IMPORTED_LOCATION "${WEAK_NODE_API_LIB}"
    INTERFACE_INCLUDE_DIRECTORIES "${WEAK_NODE_API_INC}"
)
