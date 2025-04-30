// @ts-check

import { globalIgnores } from "eslint/config";
import globals from "globals";
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  globalIgnores(["**/dist/**"]),
  globalIgnores(["apps/test-app/ios/**"]),
  globalIgnores(["packages/react-native-node-api-modules/hermes/**"]),
  globalIgnores(["packages/node-addon-examples/examples/**"]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: [
      "apps/test-app/*.js",
      "packages/node-addon-examples/*.js",
      "packages/react-native-node-api-modules/babel-plugin.js",
      "packages/react-native-node-api-modules/react-native.config.js"
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
      "packages/react-native-node-api-modules/bin/*.mjs",
      "packages/react-native-node-api-modules/scripts/*.mjs"
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
