import { platform as android } from "./platforms/android.js";

export const allTargets = [...android.targets] as const;
export type Target = (typeof allTargets)[number];

export const platforms = [android] as const;
