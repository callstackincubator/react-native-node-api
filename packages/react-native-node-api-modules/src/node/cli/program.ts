import { EventEmitter } from "node:stream";

import { Command } from "@commander-js/extra-typings";

import { command as xcframeworks } from "./xcframeworks";

// We're attaching a lot of listeners when spawning in parallel
EventEmitter.defaultMaxListeners = 100;

export const program = new Command("react-native-node-api-modules");

program.addCommand(xcframeworks);
