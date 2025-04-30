cmake_minimum_required(VERSION 3.13)

project(react-native-node-api-modules)
set(CMAKE_CXX_STANDARD 20)

add_library(node-api-host SHARED
  ../cpp/CxxNodeApiHostModule.cpp
)

target_include_directories(node-api-host PRIVATE
  ../cpp
  ../include
)

find_package(ReactAndroid REQUIRED CONFIG)

target_link_libraries(node-api-host
  # android
  ReactAndroid::reactnative
  ReactAndroid::jsi
  # react_codegen_NodeApiHostSpec
)

target_link_options(node-api-host PRIVATE
  -Wl,--unresolved-symbols=ignore-in-object-files
)
