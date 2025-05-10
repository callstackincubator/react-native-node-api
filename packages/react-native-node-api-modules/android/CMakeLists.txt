cmake_minimum_required(VERSION 3.13)

project(react-native-node-api-modules)
set(CMAKE_CXX_STANDARD 20)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(hermes-engine REQUIRED CONFIG)

add_subdirectory(../weak-node-api weak-node-api)

target_compile_definitions(weak-node-api
  PRIVATE
  NAPI_VERSION=8
)

add_library(node-api-host SHARED
  src/main/cpp/OnLoad.cpp
  ../cpp/CxxNodeApiHostModule.cpp
  ../cpp/WeakNodeApiInjector.cpp
)

target_include_directories(node-api-host PRIVATE
  ../cpp
  ../weak-node-api
  ../weak-node-api/include
)

target_link_libraries(node-api-host
  # android
  ReactAndroid::reactnative
  ReactAndroid::jsi
  hermes-engine::libhermes
  weak-node-api
  # react_codegen_NodeApiHostSpec
)