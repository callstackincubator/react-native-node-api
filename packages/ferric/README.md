# `ferric`

A wrapper around Cargo making it easier to produce prebuilt binaries targeting iOS and Android matching the [the prebuilt binary specification](https://github.com/callstackincubator/react-native-node-api/blob/main/docs/PREBUILDS.md) as well as [napi.rs](https://napi.rs/) to generate bindings from annotated Rust code.

## Install the project

`npm install --save-dev ferric-cli`

## Add scripts

```json
"scripts": {
  "gen:rs": "ferric init lib_name",
   "build": "ferric build --cwd lib_name",
   "build:release": "npm run build -- --configuration release"
}
```

### Project Structure

After generating the project, a folder would be created with the following file structure for the lib.

```markdown
lib_name
│ Cargo.toml
│ build.rs
│ .gitignore
└───src
│ │ lib.rs
└───dist (after build)
│ │ index.js
│ │ index.d.ts
│ │ native_android_folder
│ │ native_ios_folder
```

> Example project seen in `apps/test-app/lib_in_rust`.
