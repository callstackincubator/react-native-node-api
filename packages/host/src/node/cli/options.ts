import { Option } from "@commander-js/extra-typings";

import { assertPathSuffix, PATH_SUFFIX_CHOICES } from "../path-utils";

const { NODE_API_PATH_SUFFIX } = process.env;
if (typeof NODE_API_PATH_SUFFIX === "string") {
  assertPathSuffix(NODE_API_PATH_SUFFIX);
}

export const pathSuffixOption = new Option(
  "--path-suffix <strategy>",
  "Controls how the path of the addon inside a package is transformed into a library name"
)
  .choices(PATH_SUFFIX_CHOICES)
  .default(NODE_API_PATH_SUFFIX || "strip");
