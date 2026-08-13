---
"react-native-node-api": patch
---

Load addons through Hermes' `hermes_napi_load_module` instead of the host's own
`dlopen` + `dlsym` implementation:

- Addons that register themselves by calling the deprecated
  `napi_module_register` are now supported. Previously only addons exporting a
  `napi_register_module_v1` symbol could be loaded, and the rest resolved to
  `undefined`.
- A failing `requireNodeAddon` now throws an error naming the addon, the path
  that was tried and the underlying reason (e.g. the `dlopen` error), instead
  of silently resolving to `undefined`.
- `node_api_get_module_file_name` now reports the path the addon was loaded
  from, instead of an empty string.

This also opens a Node-API handle scope around loading and initializing an
addon. Without one, the `exports` object handed to the addon's initialization
function was not reachable by the garbage collector, so a collection triggered
during initialization could free it while the addon was still populating it.
