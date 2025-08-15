// @ts-check

import { globalIgnores } from "eslint/config";
import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tseslint.config(
  globalIgnores([
    "**/dist/**",
    "**/build/**",
    "apps/test-app/ios/**",
    "packages/host/hermes/**",
    "packages/node-addon-examples/examples/**",
    "packages/ferric-example/dist/ferric_example.d.ts",
    "packages/ferric-example/dist/ferric_example.js",
    "packages/ferric-example/target/**",
    "packages/node-tests/node/**",
    "packages/node-tests/tests/**",
    "packages/node-tests/*.generated.js",
    "packages/node-tests/*.generated.d.ts",
  ]),
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", name: ["suite", "test"], package: "node:test" },
          ],
        },
      ],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  eslintConfigPrettier,
  {
    files: [
      "apps/test-app/*.js",
      "packages/node-addon-examples/**/*.js",
      "packages/host/babel-plugin.js",
      "packages/host/react-native.config.js",
      "packages/node-tests/tests.generated.js",
    ],
    extends: [tseslint.configs.disableTypeChecked],
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
      "packages/ferric/bin/*.js",
      "packages/cmake-rn/bin/*.js",
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
