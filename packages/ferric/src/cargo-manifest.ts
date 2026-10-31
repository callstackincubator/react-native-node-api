import { chalk } from "@react-native-node-api/cli-utils";
import semver from "semver";
import { parse as parseToml } from "smol-toml";

import { MAX_NODE_API_VERSION, getNodeApiVersion } from "./features.js";
import { isRecord } from "./json.js";

export type CrateVersions = {
  napi: string;
  "napi-derive": string;
  "napi-build": string;
};

const CRATES = [
  { crate: "napi", table: "dependencies" },
  { crate: "napi-derive", table: "dependencies" },
  { crate: "napi-build", table: "build-dependencies" },
] satisfies { crate: keyof CrateVersions; table: string }[];

/**
 * Cargo separates comparators with commas, which semver expects as spaces.
 */
function toSemverRange(requirement: string) {
  return semver.validRange(requirement.replaceAll(",", " "));
}

export function isCrateVersion(requirement: string) {
  return toSemverRange(requirement) !== null;
}

/**
 * Whether a declared version requirement allows only versions below the wanted
 * one. Requirements which aren't versions at all are never considered outdated.
 */
export function isOutdated(declared: string, wanted: string) {
  const declaredRange = toSemverRange(declared);
  const wantedRange = toSemverRange(wanted);
  if (!declaredRange || !wantedRange || declaredRange === "*") {
    return false;
  }
  return semver.gt(
    semver.minVersion(wantedRange) ?? "0.0.0",
    semver.minVersion(declaredRange) ?? "0.0.0",
  );
}

/**
 * Replace a version in the text of a manifest, as serializing a parsed manifest
 * would lose its comments and formatting.
 */
function replaceCrateVersion({
  contents,
  table,
  crate,
  version,
}: {
  contents: string;
  table: string;
  crate: string;
  version: string;
}) {
  let section = "";
  const lines = contents.split("\n").map((line) => {
    const header = line.match(/^\s*\[([^[\]]+)\]/);
    if (header) {
      section = header[1].trim();
      return line;
    }
    const inTable = section === table && line.match(`^\\s*"?${crate}"?\\s*=`);
    const inCrateTable =
      section === `${table}.${crate}` && line.match(/^\s*version\s*=/);
    if (!inTable && !inCrateTable) {
      return line;
    }
    const pattern = inTable
      ? /(=\s*(?:\{[^}]*?\bversion\s*=\s*)?)(["'])[^"']*\2/
      : /(=\s*)(["'])[^"']*\2/;
    return line.replace(pattern, `$1$2${version}$2`);
  });
  return lines.join("\n");
}

function getCrateDeclaration(
  manifest: Record<string, unknown>,
  table: string,
  crate: string,
) {
  const dependencies = manifest[table];
  return isRecord(dependencies) ? dependencies[crate] : undefined;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function inspectFeatures(dependencies: Record<string, unknown>) {
  const result: string[] = [];
  const napi = dependencies["napi"];
  if (isRecord(napi) || typeof napi === "string") {
    if (!isRecord(napi) || napi["default-features"] !== false) {
      result.push(
        `Cargo.toml doesn't declare ${chalk.blue("default-features = false")} on ${chalk.blue("napi")}, which ferric build rejects`,
      );
    }
    const features = isRecord(napi) ? getStringArray(napi["features"]) : [];
    if (getNodeApiVersion(features) > MAX_NODE_API_VERSION) {
      result.push(
        `Cargo.toml enables a ${chalk.blue("napi")} feature above the Node-API version ${MAX_NODE_API_VERSION} supported by the host`,
      );
    }
  }
  const napiSys = dependencies["napi-sys"];
  if (isRecord(napiSys) || typeof napiSys === "string") {
    const version = isRecord(napiSys) ? napiSys["version"] : napiSys;
    if (typeof version === "string" && version.startsWith("=")) {
      result.push(
        `Cargo.toml pins ${chalk.blue(`napi-sys ${version}`)}, which is likely to conflict with newer ${chalk.blue("napi")} versions: remove the pin`,
      );
    }
    const features = isRecord(napiSys)
      ? getStringArray(napiSys["features"])
      : [];
    if (features.includes("dyn-symbols")) {
      result.push(
        `Cargo.toml enables the ${chalk.blue("dyn-symbols")} feature of ${chalk.blue("napi-sys")}, which ferric build rejects`,
      );
    }
  }
  return result;
}

/**
 * Bump outdated crates of an existing manifest in place and report anything else
 * it needs to build into a Node-API module. Everything but those versions is
 * left to the developer.
 */
export function updateCargoManifest(
  contents: string,
  crateVersions: CrateVersions,
) {
  let manifest: unknown;
  try {
    manifest = parseToml(contents);
  } catch (error) {
    return {
      contents,
      notices: [
        `Cargo.toml could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
  if (!isRecord(manifest)) {
    return { contents, notices: ["Cargo.toml doesn't declare a package"] };
  }
  const parsed = manifest;
  const notices: string[] = [];
  const lib = parsed["lib"];
  const crateType = isRecord(lib) ? lib["crate-type"] : undefined;
  if (!Array.isArray(crateType) || !crateType.includes("cdylib")) {
    notices.push(
      `Cargo.toml doesn't declare ${chalk.blue('crate-type = ["cdylib"]')} in its ${chalk.blue("[lib]")} section, which Node-API modules are built as`,
    );
  }

  let updated = contents;
  for (const { crate, table } of CRATES) {
    const wanted = crateVersions[crate];
    const declaration = getCrateDeclaration(parsed, table, crate);
    if (declaration === undefined) {
      notices.push(
        `Cargo.toml is missing ${chalk.blue(crate)} from its ${chalk.blue(`[${table}]`)}`,
      );
      continue;
    }
    const declared = isRecord(declaration)
      ? declaration["version"]
      : declaration;
    if (typeof declared !== "string") {
      notices.push(
        `Cargo.toml doesn't declare ${chalk.blue(crate)} with a version: make sure it resolves to ${chalk.blue(wanted)} or newer`,
      );
    } else if (isOutdated(declared, wanted)) {
      const replaced = replaceCrateVersion({
        contents: updated,
        table,
        crate,
        version: wanted,
      });
      const result: unknown = parseToml(replaced);
      const resolved = isRecord(result)
        ? getCrateDeclaration(result, table, crate)
        : undefined;
      const version = isRecord(resolved) ? resolved["version"] : resolved;
      if (version === wanted) {
        updated = replaced;
      } else {
        notices.push(
          `Couldn't update ${chalk.blue(crate)} in Cargo.toml: change ${chalk.blue(declared)} to ${chalk.blue(wanted)}`,
        );
      }
    }
  }

  const dependencies = parsed["dependencies"];
  if (isRecord(dependencies)) {
    notices.push(...inspectFeatures(dependencies));
  }
  return { contents: updated, notices };
}
