import { Command } from "@react-native-node-api/cli-utils";

import { printBanner } from "./banner.js";
import { buildCommand } from "./build.js";

export const program = new Command("ferric")
  .hook("preAction", () => printBanner())
  .description("Rust Node-API Modules for React Native")
  .addCommand(buildCommand, { isDefault: true });
