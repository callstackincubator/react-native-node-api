---
"react-native-node-api": patch
---

Fix `require('./addon')` being rewritten to a native addon when `addon.js` or `addon.json` exists next to `addon.node`, matching Node.js resolution order.
