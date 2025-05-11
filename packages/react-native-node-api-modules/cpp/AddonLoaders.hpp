#pragma once
#include "Logger.hpp"

#include <assert.h>

#if defined(__APPLE__) || defined(__ANDROID__)
#include <dlfcn.h>
#include <stdio.h>

using callstack::nodeapihost::log_debug;

struct PosixLoader {
  using Module = void *;
  using Symbol = void *;

  static Module loadLibrary(const char *filePath) {
    assert(NULL != filePath);

    Module result = dlopen(filePath, RTLD_NOW | RTLD_LOCAL);
    if (NULL == result) {
      log_debug("NapiHost: Failed to load library '%s': %s", filePath,
                dlerror());
    }
    return result;
  }

  static Symbol getSymbol(Module library, const char *name) {
    assert(NULL != library);
    assert(NULL != name);
    Symbol result = dlsym(library, name);
    // if (NULL == result) {
    //   NSLog(@"NapiHost: Cannot find '%s' symbol!", name);
    // }
    return result;
  }

  static void unloadLibrary(Module library) {
    if (NULL != library) {
      dlclose(library);
    }
  }
};
#endif

#if defined(_WIN32)
struct Win32Loader {
  using Module = HMODULE;
  using Symbol = void *;

  static Module loadLibrary(const char *filePath) {
    assert(NULL != filePath);
    Module result = LoadLibrary(filePath);
    if (NULL == result) {
      // TODO: Handle the error case... call GetLastError() that gives us error
      // code as DWORD
    }
    return result;
  }

  static Symbol getSymbol(Module library, const char *name) {
    assert(NULL != library);
    assert(NULL != name);
    Symbol result = GetProcAddress(library, name);
    if (NULL == result) {
      // TODO: Handle the error case... call GetLastError() that gives us error
      // code as DWORD
    }
    return result;
  }

  static void unloadLibrary(Module library) {
    if (NULL != library) {
      FreeLibrary(library);
    }
  }
};

struct WinRTLoader {
  using Module = HMODULE;
  using Symbol = void *;

  static Module loadLibrary(const char *filePath) {
    assert(NULL != filePath);
    Module result = LoadPackagedLibrary(filePath);
    if (NULL == result) {
      // TODO: Handle the error case... call GetLastError() that gives us error
      // code as DWORD
    }
    return result;
  }

  static Symbol getSymbol(Module library, const char *name) {
    assert(NULL != library);
    assert(NULL != name);
    Symbol result = GetProcAddress(library, name);
    if (NULL == result) {
      // TODO: Handle the error case... call GetLastError() that gives us error
      // code as DWORD
    }
    return result;
  }

  static void unloadLibrary(Module library) {
    if (NULL != library) {
      FreeLibrary(library);
    }
  }
};
#endif