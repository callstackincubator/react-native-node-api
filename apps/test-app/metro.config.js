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

console.log("watchFolders =", config.watchFolders);

if (config.watchFolders.length === 0) {
  // This patch is needed to locate packages in the monorepo from the MacOS app
  // which is intentionally kept outside of the workspaces configuration to prevent
  // duplicate react-native version and pollution of the package lock.
  const path = require("node:path");
  config.watchFolders.push(path.resolve(__dirname, "../.."));
}

module.exports = config;
