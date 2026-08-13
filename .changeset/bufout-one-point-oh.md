---
"@react-native-node-api/cli-utils": patch
"react-native-node-api": patch
"cmake-rn": patch
"ferric-cli": patch
---

Upgrade `bufout` to v1.0.0, which keeps the number of listeners on the process
and the output streams constant regardless of how many children are spawned
concurrently: a single shared `exit`/`SIGINT` listener is attached only while
children are running, and every child pipes into one shared pass-through per
destination stream.

That removes the reason for the CLIs to raise `EventEmitter.defaultMaxListeners`
to 100, so those assignments are gone and Node's default limit again applies —
restoring the leak warning it exists to give.
