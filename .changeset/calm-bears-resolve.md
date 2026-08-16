---
"react-native-node-api": patch
---

Preserve Node.js module resolution precedence when a JavaScript file and native addon share a basename: `require('./foo')` no longer gets rewritten to load a Node-API addon when a same-named `foo.js`/`.cjs`/`.mjs`/`.json` file exists alongside it, since that source file is what `require()` actually resolves to. An explicit `require('./foo.node')` is unaffected.
