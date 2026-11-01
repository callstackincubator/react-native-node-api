---
"react-native-node-api": minor
---

Export `dlopen(module, filename)`, loading a Node-API addon with the same semantics as Node's `process.dlopen`: `filename` is passed as-is to the system's `dlopen` (e.g. `lib<name>.so` on Android, `@rpath/<name>.framework/<name>` on Apple platforms), the addon's exports are assigned to `module.exports` and nothing is cached.

`requireNodeAddon` is now built on top of it, with the platform specific path and the per-runtime exports cache moving from native code into TypeScript. Its behavior is unchanged.
