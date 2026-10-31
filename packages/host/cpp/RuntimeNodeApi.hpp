#pragma once

#include "node_api.h"

namespace callstack::react_native_node_api {

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
// Remove this one too once a Node-API fatal error is confirmed to reach logcat
// on a device through installHermesFatalHandler().
void __attribute__((noreturn)) napi_fatal_error(const char *location,
                                                size_t location_len,
                                                const char *message,
                                                size_t message_len);

} // namespace callstack::react_native_node_api
