---
"react-native-node-api": patch
---

Fix the Babel plugin rewriting `require(...)` calls that resolve to a
same-named `.js`/`.cjs`/`.mjs`/`.json` file sitting next to a Node-API
prebuild. Node's own module resolution always picks the source file over a
`.node` addon in that case, so the plugin now leaves those calls alone
instead of rewriting them to `requireNodeAddon(...)`, which would have loaded
the wrong module at runtime.

Also exports `escapeBundleIdentifier`, used internally to derive a
framework's `CFBundleIdentifier`, so it can be reused to verify one against
its expected value.
