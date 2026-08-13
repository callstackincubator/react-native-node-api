---
"ferric-cli": patch
---

Add `--dts-only` flag to `ferric build`, generating just the TypeScript declaration file and JS entrypoint without cross-compiling any Android/Apple binaries. It still runs a real host `cargo build` (napi-rs has no lighter typegen-only mode), so it's meant for regenerating a checked-in declarations fixture rather than for environments without a Rust toolchain.
