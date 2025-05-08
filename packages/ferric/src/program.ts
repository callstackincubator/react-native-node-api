import { Command } from "@commander-js/extra-typings";

import { printBanner } from "./banner.js";
import { buildCommand } from "./build.js";

export const program = new Command("ferric")
  .hook("preAction", () => printBanner())
  .description("Rust Node-API Modules for React Native")
  .addCommand(buildCommand);
