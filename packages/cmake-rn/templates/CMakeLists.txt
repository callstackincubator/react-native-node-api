cmake_minimum_required(VERSION 3.15...3.31)
project({{name}})

# Defines the "weak-node-api" target, passed in by cmake-rn
include(${WEAK_NODE_API_CONFIG})

add_library({{name}} SHARED src/addon.c)
target_link_libraries({{name}} PRIVATE weak-node-api)
set_target_properties({{name}} PROPERTIES PREFIX "" SUFFIX .node)
