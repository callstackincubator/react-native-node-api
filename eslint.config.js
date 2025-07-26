// @ts-check

import { globalIgnores } from "eslint/config";
import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  globalIgnores([".nx/**"]),
  globalIgnores(["**/dist/**"]),
  globalIgnores(["apps/test-app/ios/**"]),
  globalIgnores(["packages/host/hermes/**"]),
  globalIgnores(["packages/node-addon-examples/examples/**"]),
  globalIgnores(["packages/ferric-example/ferric_example.d.ts"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: [
      "apps/test-app/*.js",
      "packages/node-addon-examples/*.js",
      "packages/host/babel-plugin.js",
      "packages/host/react-native.config.js",
    ],
    languageOptions: {
      parserOptions: {
        sourceType: "commonjs",
      },
      globals: {
        ...globals.commonjs,
      },
    },
    rules: {
      // We're using CommonJS here for Node.js backwards compatibility
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: [
      "packages/gyp-to-cmake/bin/*.js",
      "packages/host/bin/*.mjs",
      "packages/host/scripts/*.mjs",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
