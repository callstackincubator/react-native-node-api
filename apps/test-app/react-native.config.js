const project = (() => {
  try {
    const { configureProjects } = require("react-native-test-app");
    const project = configureProjects({
      android: {
        sourceDir: "android",
      },
      ios: {
        sourceDir: "ios",
        automaticPodsInstallation: false,
      },
      // windows: {
      //   sourceDir: "windows",
      //   solutionFile: "windows/react-native-node-api-example.sln",
      // },
    });
    return {
      ...project,
    };
  } catch {
    return undefined;
  }
})();

module.exports = {
  ...(project ? { project } : undefined),
};
