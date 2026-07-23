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
  const path = require("node:path");

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
