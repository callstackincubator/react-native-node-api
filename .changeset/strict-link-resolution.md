---
"react-native-node-api": minor
---

Add a `--fail-on-error` option to `react-native-node-api link`. By default,
unresolvable dependencies continue to be skipped with a warning; the new flag
instead surfaces the original package-resolution error and exits unsuccessfully,
which makes broken package `exports` configurations diagnosable in CI.
