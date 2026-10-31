cmake_minimum_required(VERSION 3.15...3.31)
project(cmake-rn-example)

# Defines the "weak-node-api" target, passed in by cmake-rn
include(${WEAK_NODE_API_CONFIG})

add_library(cmake-rn-example SHARED src/addon.c)
target_link_libraries(cmake-rn-example PRIVATE weak-node-api)
set_target_properties(cmake-rn-example PROPERTIES PREFIX "" SUFFIX .node)
