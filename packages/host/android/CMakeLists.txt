cmake_minimum_required(VERSION 3.13)

project(react-native-node-api)
set(CMAKE_CXX_STANDARD 20)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(hermes-engine REQUIRED CONFIG)
find_package(weak-node-api REQUIRED CONFIG)

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
  weak-node-api
  # react_codegen_NodeApiHostSpec
)

if(TARGET hermes-engine::hermesvm)
  # The Hermes target changed name in Hermes version used by React Native 0.82.0 and upwards
  target_link_libraries(node-api-host PRIVATE hermes-engine::hermesvm)
elseif(TARGET hermes-engine::libhermes)
  target_link_libraries(node-api-host PRIVATE hermes-engine::libhermes)
else()
  message(FATAL_ERROR "Neither hermes-engine::hermesvm nor hermes-engine::libhermes target found.")
endif()
