import { program } from "./program.js";

program.parseAsync(process.argv).catch(console.error);
