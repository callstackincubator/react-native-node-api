import assert from "node:assert/strict";
import path from "node:path";

import type { PluginObj, NodePath } from "@babel/core";
import * as t from "@babel/types";
import { packageDirectorySync } from "pkg-dir";
import { readPackageSync } from "read-pkg";

import { isNodeApiModule } from "../path-utils";

export type PluginOptions = {
  stripPathSuffix?: boolean;
};

function assertOptions(opts: unknown): asserts opts is PluginOptions {
  assert(typeof opts === "object" && opts !== null, "Expected an object");
  if ("stripPathSuffix" in opts) {
    assert(
      typeof opts.stripPathSuffix === "boolean",
      "Expected 'stripPathSuffix' to be a boolean"
    );
  }
}

// This function should work with both CommonJS and ECMAScript modules,
// (pretending that addons are supported with ES module imports), hence it
// must accept following import specifiers:
//   - "Relative specifiers" (e.g. `./build/Release/addon.node`)
//   - "Bare specifiers", in particular
//     - to an entry point (e.g. `@callstack/example-addon`)
//     - any specific exported feature within
//   - "Absolute specifiers" like `node:fs/promise` and URLs.
//
// This function should also respect the Package entry points defined in the
// respective "package.json" file using "main" or "exports" and "imports"
// fields (including conditional exports and subpath imports).
// - https://nodejs.org/api/packages.html#package-entry-points
// - https://nodejs.org/api/packages.html#subpath-imports
function tryResolveModulePath(id: string, from: string): string | undefined {
  if (id.includes(":")) {
    // This must be a prefixed "Absolute specifier". We assume its a built-in
    // module and pass it through without any changes. For security reasons,
    // we don't support URLs to dynamic libraries (like Node-API addons).
    return undefined;
  } else {
    // TODO: Stay compatible with https://nodejs.org/api/modules.html#all-together
    try {
      return require.resolve(id, { paths: [from] });
    } catch {
      return undefined;
    }
  }
}

const nodeBindingsSubdirs = [
  "./",
  "./build/Release",
  "./build/Debug",
  "./build",
  "./out/Release",
  "./out/Debug",
  "./Release",
  "./Debug",
];
function findNodeAddonForBindings(id: string, fromDir: string) {
  const idWithExt = id.endsWith(".node") ? id : `${id}.node`;
  // Support traversing the filesystem to find the Node-API module.
  // Currently, we check the most common directories like `bindings` does.
  for (const subdir of nodeBindingsSubdirs) {
    const resolvedPath = path.join(fromDir, subdir, idWithExt);
    if (isNodeApiModule(resolvedPath)) {
      return resolvedPath;
    }
  }
  return undefined;
}

export function replaceWithRequireNodeAddon3(
  p: NodePath,
  resolvedPath: string,
  requiredFrom: string
) {
  const pkgRoot = packageDirectorySync({ cwd: resolvedPath });
  if (pkgRoot === undefined) {
    throw new Error("Unable to locate package directory!");
  }

  const subpath = path.relative(pkgRoot, resolvedPath);
  const dottedSubpath = subpath.startsWith("./") ? subpath : `./${subpath}`;
  const fromRelative = path.relative(pkgRoot, requiredFrom); // TODO: might escape package
  const { name } = readPackageSync({ cwd: pkgRoot });

  p.replaceWith(
    t.callExpression(
      t.memberExpression(
        t.callExpression(t.identifier("require"), [
          t.stringLiteral("react-native-node-api-modules"),
        ]),
        t.identifier("requireNodeAddon")
      ),
      [dottedSubpath, name, fromRelative]
        .map(t.stringLiteral),
    )
  );
}

export function plugin(): PluginObj {
  return {
    visitor: {
      CallExpression(p) {
        assertOptions(this.opts);
        if (typeof this.filename !== "string") {
          // This transformation only works when the filename is known
          return;
        }
        const from = path.dirname(this.filename);

        const { node } = p;
        const [argument] = node.arguments;
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          argument.type === "StringLiteral"
        ) {
          // Require call with a string literal argument
          const id = argument.value;
          if (id === "bindings" && p.parent.type === "CallExpression") {
            const [argument] = p.parent.arguments;
            if (argument.type === "StringLiteral") {
              const id = argument.value;
              const resolvedPath = findNodeAddonForBindings(id, from);
              if (resolvedPath !== undefined) {
                replaceWithRequireNodeAddon3(p.parentPath, resolvedPath, this.filename);
              }
            }
          } else {
            // This should handle "bare specifiers" and "private imports" that start with `#`
            const resolvedPath = tryResolveModulePath(id, from);
            if (!!resolvedPath && isNodeApiModule(resolvedPath)) {
              replaceWithRequireNodeAddon3(p, resolvedPath, this.filename);
            }
          }
        }
      },
    },
  };
}
