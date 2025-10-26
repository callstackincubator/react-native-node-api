import cp from "node:child_process";

import { UsageError } from "@react-native-node-api/cli-utils";

export function getInstalledTargets() {
  try {
    return new Set(
      cp
        .execFileSync("rustup", ["target", "list", "--installed"], {
          encoding: "utf-8",
        })
        .split("\n")
        .filter((line) => line.trim() !== ""),
    );
  } catch (error) {
    throw new UsageError(
      "You need a Rust toolchain: https://doc.rust-lang.org/cargo/getting-started/installation.html#install-rust-and-cargo",
      { cause: error },
    );
  }
}

/**
 * Check if build-std prerequisites are available for tier 3 targets
 */
export function isBuildStdAvailable(): boolean {
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
