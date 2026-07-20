const { makeMetroConfig } = require("@rnx-kit/metro-config");

const config = makeMetroConfig({
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
});

if (config.projectRoot.endsWith("macos-test-app")) {
  // This patch is needed to locate packages in the monorepo from the MacOS app
  // which is intentionally kept outside of the workspaces configuration to prevent
  // duplicate react-native version and pollution of the package lock.
  const path = require("node:path");
  config.watchFolders.push(path.resolve(__dirname, "../.."));

  // The babel plugin rewrites `require("something.node")` inside the workspace
  // packages (e.g. packages/ferric-example/ferric_example.js) into
  // `require("react-native-node-api").requireNodeAddon(...)`. Those files live
  // outside this app, so Metro resolves the bare `react-native-node-api` (and
  // sibling workspace packages) by walking up from the package directory. Under
  // npm's hoisted workspaces that specifier happens to sit in the repo-root
  // node_modules, but under pnpm's isolated node_modules it does not, so the
  // rewritten require fails to resolve. This app installs the workspace packages
  // into its own node_modules (via `npm install` of `file:` deps), so add that
  // directory as a global module-resolution path to make resolution independent
  // of the root package manager's hoisting layout.
  config.resolver = config.resolver || {};
  config.resolver.nodeModulesPaths = [
    ...(config.resolver.nodeModulesPaths || []),
    path.resolve(__dirname, "node_modules"),
  ];
}

module.exports = config;
