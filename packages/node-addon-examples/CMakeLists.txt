cmake_minimum_required(VERSION 3.15...3.31)
project(node-addon-examples)

file(GLOB_RECURSE SUBDIR_CMAKE_LISTS
  "${CMAKE_CURRENT_SOURCE_DIR}/examples/*/CMakeLists.txt"
  "${CMAKE_CURRENT_SOURCE_DIR}/tests/*/CMakeLists.txt"
)

foreach(SUBDIR_CMAKE ${SUBDIR_CMAKE_LISTS})
  get_filename_component(SUBDIR_PATH ${SUBDIR_CMAKE} DIRECTORY)
  add_subdirectory(${SUBDIR_PATH} ${SUBDIR_PATH}/build)
endforeach()
