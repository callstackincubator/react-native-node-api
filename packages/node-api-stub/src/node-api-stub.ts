import path from "node:path";

export const nodeApiStubPath = path.resolve(import.meta.dirname, "..");

/**
 * Name of the CMake target building the stub, which is only linked against and never shipped.
 */
export const NODE_API_STUB_TARGET = "node-api-stub";
