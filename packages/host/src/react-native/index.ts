import { type TurboModule, TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  requireNodeAddon<T = unknown>(libraryName: string): T;
}

const native = TurboModuleRegistry.getEnforcing<Spec>("NodeApiHost");

/**
 * Loads a native Node-API addon by filename.
 */
export function requireNodeAddon<T = unknown>(libraryName: string): T {
  return native.requireNodeAddon<T>(libraryName);
}
