import assert from "node:assert/strict";
import path from "node:path";

import type { PluginObj, NodePath } from "@babel/core";
import * as t from "@babel/types";

import { getLibraryName, isNodeApiModule, NamingStrategy } from "../path-utils";

type PluginOptions = {
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

export function replaceWithRequireNodeAddon(
  p: NodePath,
  modulePath: string,
  naming: NamingStrategy
) {
  const requireCallArgument = getLibraryName(modulePath, naming);
  p.replaceWith(
    t.callExpression(
      t.memberExpression(
        t.callExpression(t.identifier("require"), [
          t.stringLiteral("react-native-node-api-modules"),
        ]),
        t.identifier("requireNodeAddon")
      ),
      [t.stringLiteral(requireCallArgument)]
    )
  );
}

export function plugin(): PluginObj {
  return {
    visitor: {
      CallExpression(p) {
        assertOptions(this.opts);
        const { stripPathSuffix = false } = this.opts;
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
              const relativePath = path.join(from, id);
              // TODO: Support traversing the filesystem to find the Node-API module
              if (isNodeApiModule(relativePath)) {
                replaceWithRequireNodeAddon(p.parentPath, relativePath, {
                  stripPathSuffix,
                });
              }
            }
          } else if (
            !path.isAbsolute(id) &&
            isNodeApiModule(path.join(from, id))
          ) {
            const relativePath = path.join(from, id);
            replaceWithRequireNodeAddon(p, relativePath, { stripPathSuffix });
          }
        }
      },
    },
  };
}
