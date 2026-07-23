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

  // Resolve workspace packages (and the specifiers the babel plugin rewrites
  // their `*.node` requires to) from this app's own node_modules, independent of
  // the root package manager's hoisting layout.
  config.resolver = config.resolver || {};
  config.resolver.nodeModulesPaths = [
    ...(config.resolver.nodeModulesPaths || []),
    path.resolve(__dirname, "node_modules"),
  ];
}

module.exports = config;
