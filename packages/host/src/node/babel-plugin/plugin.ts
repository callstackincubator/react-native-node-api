import assert from "node:assert/strict";
import path from "node:path";

import type { PluginObj, NodePath } from "@babel/core";
import * as t from "@babel/types";

import {
  getLibraryName,
  isNodeApiModule,
  findNodeAddonForBindings,
  NamingStrategy,
  LibraryNamingChoice,
  assertLibraryNamingChoice,
} from "../path-utils";

export type PluginOptions = {
  /**
   * Controls how the package name is transformed into a library name.
   * The transformation is needed to disambiguate and avoid conflicts between addons with the same name (but in different sub-paths or packages).
   *
   * As an example, if the package name is `@my-org/my-pkg` and the path of the addon within the package is `build/Release/my-addon.node` (and `pathSuffix` is set to `"strip"`):
   * - `"omit"`: Only the path within the package is used and the library name will be `my-addon`.
   * - `"strip"`: Scope / org gets stripped and the library name will be `my-pkg--my-addon`.
   * - `"keep"`: The org and name is kept and the library name will be `my-org--my-pkg--my-addon`.
   */
  packageName?: LibraryNamingChoice;

  /**
   * Controls how the path of the addon inside a package is transformed into a library name.
   * The transformation is needed to disambiguate and avoid conflicts between addons with the same name (but in different sub-paths or packages).
   *
   * As an example, if the package name is `my-pkg` and the path of the addon within the package is `build/Release/my-addon.node`:
   * - `"omit"`: Only the package name is used and the library name will be `my-pkg`.
   * - `"strip"` (default): Path gets stripped to its basename and the library name will be `my-pkg--my-addon`.
   * - `"keep"`: The full path is kept and the library name will be `my-pkg--build-Release-my-addon`.
   */
  pathSuffix?: LibraryNamingChoice;
};

function assertOptions(opts: unknown): asserts opts is PluginOptions {
  assert(typeof opts === "object" && opts !== null, "Expected an object");
  if ("pathSuffix" in opts) {
    assertLibraryNamingChoice(opts.pathSuffix);
  }
  if ("packageName" in opts) {
    assertLibraryNamingChoice(opts.packageName);
  }
}

export function replaceWithRequireNodeAddon(
  p: NodePath,
  modulePath: string,
  naming: NamingStrategy,
) {
  const requireCallArgument = getLibraryName(modulePath, naming);
  p.replaceWith(
    t.callExpression(
      t.memberExpression(
        t.callExpression(t.identifier("require"), [
          t.stringLiteral("react-native-node-api"),
        ]),
        t.identifier("requireNodeAddon"),
      ),
      [t.stringLiteral(requireCallArgument)],
    ),
  );
}

export function plugin(): PluginObj {
  return {
    visitor: {
      CallExpression(p) {
        assertOptions(this.opts);
        const { pathSuffix = "strip", packageName = "strip" } = this.opts;
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
              if (typeof resolvedPath === "string") {
                replaceWithRequireNodeAddon(p.parentPath, resolvedPath, {
                  packageName,
                  pathSuffix,
                });
              }
            }
          } else if (
            !path.isAbsolute(id) &&
            isNodeApiModule(path.join(from, id))
          ) {
            const relativePath = path.join(from, id);
            replaceWithRequireNodeAddon(p, relativePath, {
              packageName,
              pathSuffix,
            });
          }
        }
      },
    },
  };
}
