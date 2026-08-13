#pragma once

#include "node_api.h"

namespace callstack::react_native_node_api {

// Hermes' first-party Node-API implementation (API/napi/hermes_napi.cpp)
// already defines napi_fatal_error, routing it through hermes_fatal() ->
// llvh::report_fatal_error(), which writes to stderr. On Android stderr is
// not logcat, so that message would be lost exactly when it matters most:
// right before the process aborts.
//
// This declaration is deliberately kept so it shadows Hermes' symbol: the
// generated injector (scripts/generate-injector.mts) resolves each
// NodeApiHost field by unqualified name inside
// `namespace callstack::react_native_node_api`, and this header is included
// there, so unqualified lookup finds this declaration before it would reach
// Hermes' exported symbol. That lets the host's implementation win, which
// logs via the host logger to logcat with the "NodeApiHost" tag (see
// Logger.cpp) before aborting.
//
// Every other Node-API function the host used to shim here (buffers,
// napi_get_version, napi_get_node_version) was removed in favor of letting
// the same lookup fall through to Hermes' own implementation - see
// https://github.com/callstackincubator/react-native-node-api/issues/428.
// Do not remove this one the same way without replacing the logcat routing.
void __attribute__((noreturn)) napi_fatal_error(const char *location,
                                                size_t location_len,
                                                const char *message,
                                                size_t message_len);

} // namespace callstack::react_native_node_api
