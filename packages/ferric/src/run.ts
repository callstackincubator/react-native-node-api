import EventEmitter from "node:events";

import { program } from "./program.js";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

program.parseAsync(process.argv).catch(console.error);
