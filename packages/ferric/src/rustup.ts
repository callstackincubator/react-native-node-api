import cp from "node:child_process";

import { UsageError } from "@react-native-node-api/cli-utils";

export function getInstalledTargets() {
  try {
    return new Set(
      cp
        .execFileSync("rustup", ["target", "list", "--installed"], {
          encoding: "utf-8",
        })
        .split("\n"),
    );
  } catch (error) {
    throw new UsageError(
      "You need a Rust toolchain: https://doc.rust-lang.org/cargo/getting-started/installation.html#install-rust-and-cargo",
      { cause: error },
    );
  }
}
