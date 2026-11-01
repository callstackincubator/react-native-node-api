import { Platform, type TurboModule, TurboModuleRegistry } from "react-native";

export interface Module {
  exports: unknown;
}

export interface Spec extends TurboModule {
  dlopen(module: Module, filename: string): void;
}

const native = TurboModuleRegistry.getEnforcing<Spec>("NodeApiHost");

/**
 * Loads the Node-API addon at `filename` and assigns its exports to `module.exports`,
 * with the same semantics as Node's `process.dlopen`.
 *
 * `filename` is passed as-is to the system's `dlopen`: e.g. `lib<name>.so` on Android
 * and `@rpath/<name>.framework/<name>` on Apple platforms.
 * Nothing is cached: calling it again runs the addon's initialization function again.
 */
export function dlopen(module: Module, filename: string): void {
  native.dlopen(module, filename);
}

const APPLE_PLATFORMS: readonly string[] = ["ios", "macos", "visionos"];

function getLibraryFilename(libraryName: string): string {
  if (Platform.OS === "android") {
    return `lib${libraryName}.so`;
  } else if (APPLE_PLATFORMS.includes(Platform.OS)) {
    return `@rpath/${libraryName}.framework/${libraryName}`;
  } else {
    throw new Error(
      `Loading Node-API addons is unsupported on '${Platform.OS}'`,
    );
  }
}

// Module scope is per JS runtime, so is this cache.
const addons = new Map<string, Module>();

/**
 * Loads a native Node-API addon by library name, returning the exports of a previous load of the same library.
 */
export function requireNodeAddon<T = unknown>(libraryName: string): T;
export function requireNodeAddon(libraryName: string): unknown {
  const cached = addons.get(libraryName);
  if (cached) {
    return cached.exports;
  }
  const filename = getLibraryFilename(libraryName);
  const module: Module = { exports: {} };
  try {
    dlopen(module, filename);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load '${libraryName}' addon from '${filename}': ${reason}`,
    );
  }
  addons.set(libraryName, module);
  return module.exports;
}
