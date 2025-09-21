cmake_minimum_required(VERSION 3.15...3.31)
project(tests-buffers)

include(${WEAK_NODE_API_CONFIG})

add_library(addon SHARED addon.c)
set_target_properties(addon PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(addon PRIVATE weak-node-api)
target_compile_features(addon PRIVATE cxx_std_17)