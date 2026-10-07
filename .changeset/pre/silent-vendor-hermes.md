---
"react-native-node-api": patch
---

Make `vendor-hermes --silent` actually silent. The spinners were passed
`isEnabled: false`, which stops the animation but still writes the spinner text
and its final symbol to stderr. They now use `isSilent`, which suppresses the
output entirely, leaving the vendored Hermes path on stdout as the command's
only output.
