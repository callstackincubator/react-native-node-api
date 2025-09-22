import { program } from "./cli.js";

program.parseAsync(process.argv).catch(console.error);
