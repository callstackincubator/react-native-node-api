import { program } from "./program";

program.parseAsync(process.argv).catch(console.error);
