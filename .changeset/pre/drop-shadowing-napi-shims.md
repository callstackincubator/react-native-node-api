---
"react-native-node-api": patch
---

Drop the host's shadowing implementations of Node-API functions that Hermes'
first-party Node-API already provides, so addons observe Hermes' behavior
instead of the host's older shims:

- `napi_get_node_version` now reports Hermes' own version (release name
  `"hermes"`) instead of unconditionally failing with `napi_generic_failure`.
- `napi_is_buffer` now returns `true` only for `Uint8Array`, matching Node,
  instead of any `ArrayBuffer`/`TypedArray`.
- `napi_get_buffer_info` now returns `napi_invalid_arg` for non-`Uint8Array`
  values, matching Node, instead of `napi_ok` with zeroed output.
- `napi_create_buffer_copy` now writes a non-`NULL` `result_data` argument, as
  documented, instead of silently ignoring it.
- `napi_create_buffer`, `napi_create_external_buffer` and `napi_get_version`
  are unchanged in observable behavior, now served by Hermes directly.

This also fixes a bug where calling `napi_get_buffer_info` on a non-`Uint8Array`
typed array (e.g. a `Float64Array`) left a process-global flag corrupted, so
that every subsequent `napi_create_buffer`/`napi_create_external_buffer` call
produced the wrong typed array view.

`napi_fatal_error` keeps its host-side implementation, so fatal Node-API
errors keep reaching logcat on Android instead of only stderr.
