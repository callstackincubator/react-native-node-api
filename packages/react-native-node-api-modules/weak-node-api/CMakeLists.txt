cmake_minimum_required(VERSION 3.15)
project(weak-node-api)

add_compile_definitions(-DNAPI_VERSION=8)

add_library(${PROJECT_NAME} SHARED weak-node-api.cpp ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_SOURCE_DIR}/../include)
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_17)
