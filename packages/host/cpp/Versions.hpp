#pragma once

// Must be defined before any <node_api.h> include so the header exposes the
// full v10 surface (js_native_api.h otherwise defaults this to 8).
#ifndef NAPI_VERSION
#define NAPI_VERSION 10
#endif
