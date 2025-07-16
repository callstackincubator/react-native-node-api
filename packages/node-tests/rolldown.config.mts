import { defineConfig } from "rolldown";

export default defineConfig([
  {
    input: "tests/js-native-api/2_function_arguments/test.js",
    output: {
      file: "bundle.js",
    },
    resolve: {
      alias: {
        "../../common": "yo.ts",
      },
    },
  },
]);
