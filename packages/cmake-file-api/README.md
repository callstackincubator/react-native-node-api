# CMake File API (unofficial)

The CMake File API provides an interface for querying CMake's configuration and project information.

The API is based on files, where queries are written by client tools and read by CMake and replies are then written by CMake and read by client tools. The API is versioned, and the current version is v1 and these files are located in a directory named `.cmake/api/v1` in the build directory.

This package provides a TypeScript interface to create query files and read replies and is intended to serve the same purpose to the TypeScript community that the [`cmake-file-api` crate](https://crates.io/crates/cmake-file-api), serves to the Rust community.
