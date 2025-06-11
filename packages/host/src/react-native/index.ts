console.log("Hello React Native");

import native from "./NativeNodeApiHost";

const { requireNodeAddon } = native;

export { requireNodeAddon };
