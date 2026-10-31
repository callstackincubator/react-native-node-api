import cp from "node:child_process";

import { assertFixable, chalk } from "@react-native-node-api/cli-utils";
import * as z from "zod";

import type { TargetName } from "./targets.js";

const CargoResolvedMetadata = z.object({
  packages: z.array(z.object({ id: z.string(), name: z.string() })),
  resolve: z
    .object({
      nodes: z.array(
        z.object({ id: z.string(), features: z.array(z.string()).optional() }),
      ),
    })
    .nullable(),
});

export type CargoResolvedMetadata = z.infer<typeof CargoResolvedMetadata>;

export function getResolvedFeatures(
  metadata: CargoResolvedMetadata,
  packageName: string,
): Set<string> {
  const ids = new Set(
    metadata.packages
      .filter((pkg) => pkg.name === packageName)
      .map((pkg) => pkg.id),
  );
  const nodes = metadata.resolve?.nodes ?? [];
  return new Set(
    nodes
      .filter((node) => ids.has(node.id))
      .flatMap((node) => node.features ?? []),
  );
}

function readResolvedMetadata(
  cwd: string,
  target: TargetName,
): CargoResolvedMetadata {
  const output = cp.execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--filter-platform", target],
    { cwd, encoding: "utf-8" },
  );
  return CargoResolvedMetadata.parse(JSON.parse(output));
}

export function assertNapiFeatures(cwd: string, targets: Iterable<TargetName>) {
  for (const target of targets) {
    const features = getResolvedFeatures(
      readResolvedMetadata(cwd, target),
      "napi-sys",
    );
    assertFixable(
      !features.has("dyn-symbols"),
      `The "dyn-symbols" feature of napi-sys is enabled when building for ${target}, which loads Node-API functions at runtime instead of linking them against weak-node-api`,
      {
        instructions: [
          `Set ${chalk.blue("default-features = false")} on the napi dependency in Cargo.toml and enable the "napiN" features you need explicitly.`,
          `Run ${chalk.blue(`cargo tree -e features -i napi-sys --target ${target}`)} to see which dependency enables it, or pass ${chalk.blue("--skip-feature-check")} to build anyway.`,
        ].join("\n"),
      },
    );
  }
}
