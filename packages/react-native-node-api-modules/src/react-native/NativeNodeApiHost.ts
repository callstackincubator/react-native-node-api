import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  requireNodeAddon(libraryName: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NodeApiHost");
