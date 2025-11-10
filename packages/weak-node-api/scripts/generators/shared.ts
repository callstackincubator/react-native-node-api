import type { FunctionDecl } from "../../src/node-api-functions.js";

type FunctionOptions = FunctionDecl & {
  extern?: true;
  static?: true;
  namespace?: string;
  body?: string;
  argumentNames?: string[];
};

export function generateFunction({
  extern,
  static: staticMember,
  returnType,
  namespace,
  name,
  argumentTypes,
  argumentNames = [],
  noReturn,
  body,
}: FunctionOptions) {
  return `
    ${staticMember ? "static " : ""}${extern ? 'extern "C" ' : ""}${returnType} ${namespace ? namespace + "::" : ""}${name}(
      ${argumentTypes.map((type, index) => `${type} ` + (argumentNames[index] ?? `arg${index}`)).join(", ")}
    ) ${body ? `{ ${body} ${noReturn ? "WEAK_NODE_API_UNREACHABLE;" : ""}\n}` : ""}
    ;
  `;
}
