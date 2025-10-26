// @ts-check

import { globalIgnores } from "eslint/config";
import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import importPlugin from "eslint-plugin-import";
import nodePlugin from "eslint-plugin-n";
import unusedImports from "eslint-plugin-unused-imports";

export default tseslint.config(
  globalIgnores([
    "**/dist/**",
    "**/build/**",
    "apps/test-app/ios/**",
    "packages/host/hermes/**",
    "packages/node-addon-examples/examples/**",
    "packages/ferric-example/ferric_example.js",
    "packages/ferric-example/ferric_example.d.ts",
    "packages/ferric-example/target/**",
    "packages/node-tests/node/**",
    "packages/node-tests/tests/**",
    "packages/node-tests/*.generated.js",
    "packages/node-tests/*.generated.d.ts",
  ]),
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    plugins: {
      import: importPlugin,
      n: nodePlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      // Existing rule
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", name: ["suite", "test"], package: "node:test" },
          ],
        },
      ],

      // Import/Export Organization
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "n/prefer-node-protocol": "error",

      // Type Consistency
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/prefer-as-const": "error",

      // Immutable Patterns (excluding prefer-readonly-parameter-types per feedback)
      "@typescript-eslint/prefer-readonly": "error",

      // Error Standards
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/only-throw-error": "error",

      // Function Style
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/require-await": "error",
      "prefer-arrow-callback": "error",

      // Console Control
      "no-console": ["warn", { allow: ["error", "warn"] }],

      // Unused Code
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "unused-imports/no-unused-imports": "error",

      // Strict Typing Enhancements
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
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
