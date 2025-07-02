import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  requireNodeAddon(requiredPath: string, packageName?: string, originalId?: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NodeApiHost");
