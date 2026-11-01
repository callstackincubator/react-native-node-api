import type { FunctionDecl } from "./node-api-functions.js";

type FunctionOptions = FunctionDecl & {
  extern?: true;
  static?: true;
  namespace?: string;
  body?: string;
  argumentNames?: string[];
};

/**
 * Generates the C++ declaration of a Node-API function, or its definition when a body is given.
 */
export function generateFunction({
  extern,
  static: staticMember,
  returnType,
  namespace,
  name,
  argumentTypes,
  argumentNames = [],
  body,
}: FunctionOptions) {
  return `
    ${staticMember ? "static " : ""}${extern ? 'extern "C" ' : ""}${returnType} ${namespace ? namespace + "::" : ""}${name}(
      ${argumentTypes.map((type, index) => `${type} ` + (argumentNames[index] ?? `arg${index}`)).join(", ")}
    ) ${body ? `{ ${body}\n}` : ""}
    ;
  `;
}
