cmake_minimum_required(VERSION 3.13)

project(react-native-node-api)
set(CMAKE_CXX_STANDARD 20)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(hermes-engine REQUIRED CONFIG)

add_library(weak-node-api INTERFACE)
target_include_directories(weak-node-api INTERFACE
  ../weak-node-api
  ../weak-node-api/include
)

add_library(node-api-host SHARED
  src/main/cpp/OnLoad.cpp
  ../cpp/Logger.cpp
  ../cpp/CxxNodeApiHostModule.cpp
  ../cpp/WeakNodeApiInjector.cpp
  ../cpp/RuntimeNodeApi.cpp
  ../cpp/RuntimeNodeApi.hpp
  ../cpp/RuntimeNodeApiAsync.cpp
  ../cpp/RuntimeNodeApiAsync.hpp  
)

target_include_directories(node-api-host PRIVATE
  ../cpp
)

target_link_libraries(node-api-host
  PRIVATE
  # android
  log
  ReactAndroid::reactnative
  ReactAndroid::jsi
  hermes-engine::libhermes
  weak-node-api
  # react_codegen_NodeApiHostSpec
)
