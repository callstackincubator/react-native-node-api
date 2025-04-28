module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // plugins: [['module:react-native-node-api-modules/babel-plugin', { naming: "hash" }]],
  plugins: [['module:react-native-node-api-modules/babel-plugin', { naming: "package-name" }]],
};
