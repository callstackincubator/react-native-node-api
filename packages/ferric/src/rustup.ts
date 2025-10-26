import cp from "node:child_process";

import { UsageError } from "@react-native-node-api/cli-utils";

/**
 * Tier 3 targets that require build-std (defined here to avoid circular imports)
 */
const TIER_3_TARGETS = [
  "aarch64-apple-visionos",
  "aarch64-apple-visionos-sim",
] as const;

/**
 * Check if nightly Rust with rust-src component is available for build-std
 */
function isBuildStdAvailable(): boolean {
  try {
    // Check if nightly toolchain is available
    const toolchains = cp.execFileSync("rustup", ["toolchain", "list"], {
      encoding: "utf-8",
    });
    
    if (!toolchains.includes("nightly")) {
      return false;
    }

    // Check if rust-src component is installed for nightly
    const components = cp.execFileSync("rustup", ["component", "list", "--toolchain", "nightly"], {
      encoding: "utf-8",
    });

    return components.includes("rust-src (installed)");
  } catch {
    return false;
  }
}

export function getInstalledTargets() {
  try {
    const installedTargets = new Set(
      cp
        .execFileSync("rustup", ["target", "list", "--installed"], {
          encoding: "utf-8",
        })
        .split("\n")
        .filter((line) => line.trim() !== ""),
    );

    // Add tier 3 targets if build-std is properly configured
    if (isBuildStdAvailable()) {
      for (const target of TIER_3_TARGETS) {
        installedTargets.add(target);
      }
    }

    return installedTargets;
  } catch (error) {
    throw new UsageError(
      "You need a Rust toolchain: https://doc.rust-lang.org/cargo/getting-started/installation.html#install-rust-and-cargo",
      { cause: error },
    );
  }
}
