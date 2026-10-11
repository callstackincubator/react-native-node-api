---
"react-native-node-api": patch
---

Parse binary `Info.plist` files in-process with `bplist-parser` instead of
converting them with `plutil`, so reading a framework's plist no longer
rewrites the file or requires macOS.
