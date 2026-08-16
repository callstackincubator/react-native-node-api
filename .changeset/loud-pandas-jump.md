---
"react-native-node-api": patch
---

Fixed the Babel plugin rewriting `require('./foo')` to load a Node-API addon
even when a same-named `foo.js`/`.cjs`/`.mjs`/`.json` file exists alongside it
— that source file is what Node's own `require()` resolves to, so the addon
was never reachable at runtime through that specific call, only through an
explicit `require('./foo.node')`.

Also exported `escapeBundleIdentifier` from the package's `node` entrypoint.
