cmake_minimum_required(VERSION 3.15)
project(weak-node-api)

add_library(${PROJECT_NAME} SHARED weak-node-api.cpp ${CMAKE_JS_SRC})
target_include_directories(${PROJECT_NAME} PUBLIC ${CMAKE_SOURCE_DIR}/../include)
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_17)
target_compile_definitions(${PROJECT_NAME} PRIVATE NAPI_VERSION=8)
