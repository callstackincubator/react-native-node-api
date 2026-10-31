# `ferric`

A wrapper around Cargo making it easier to produce prebuilt binaries targeting iOS and Android matching [the prebuilt binary specification](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/PREBUILDS.md) as well as [napi.rs](https://napi.rs/) to generate bindings from annotated Rust code.

## Feature check

Before building, `ferric build` asks Cargo for the crate's resolved features for each target and fails if `napi-sys`'s `dyn-symbols` feature is enabled. That feature makes napi-rs look up Node-API functions in the host process at runtime instead of linking them against `weak-node-api`, which doesn't work in React Native ([#331](https://github.com/callstackincubator/react-native-node-api/issues/331)). `napi` enables it through its default features, so disable those and pick the Node-API version explicitly:

```toml
[dependencies.napi]
version = "3"
default-features = false
features = ["napi3"]
```

Pass `--skip-feature-check` to bypass the check.
