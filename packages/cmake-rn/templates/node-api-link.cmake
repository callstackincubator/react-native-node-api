# Defines the "weak-node-api" target, passed in by cmake-rn
include(${WEAK_NODE_API_CONFIG})

add_library({{name}} SHARED src/addon.c)
target_link_libraries({{name}} PRIVATE weak-node-api)
