import path from "node:path";

import type { PluginObj, NodePath } from "@babel/core";
import * as t from "@babel/types";

import {
  getLibraryInstallName,
  isNodeApiModule,
  replaceWithNodeExtension,
} from "../path-utils";

export function replaceWithRequireNodeAddon(p: NodePath, modulePath: string) {
  const requireCallArgument = getLibraryInstallName(
    replaceWithNodeExtension(modulePath)
  );
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
                replaceWithRequireNodeAddon(p.parentPath, relativePath);
              }
            }
          } else if (
            !path.isAbsolute(id) &&
            isNodeApiModule(path.join(from, id))
          ) {
            const relativePath = path.join(from, id);
            replaceWithRequireNodeAddon(p, relativePath);
          }
        }
      },
    },
  };
}
