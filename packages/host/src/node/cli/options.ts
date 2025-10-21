import { Option } from "@react-native-node-api/cli-utils";

import {
  assertLibraryNamingChoice,
  LIBRARY_NAMING_CHOICES,
} from "../path-utils";

const { NODE_API_PACKAGE_NAME, NODE_API_PATH_SUFFIX } = process.env;
if (typeof NODE_API_PACKAGE_NAME === "string") {
  assertLibraryNamingChoice(NODE_API_PACKAGE_NAME);
}
if (typeof NODE_API_PATH_SUFFIX === "string") {
  assertLibraryNamingChoice(NODE_API_PATH_SUFFIX);
}

export const packageNameOption = new Option(
  "--package-name <strategy>",
  "Controls how the package name is transformed into a library name",
)
  .choices(LIBRARY_NAMING_CHOICES)
  .default(NODE_API_PACKAGE_NAME || "strip");

export const pathSuffixOption = new Option(
  "--path-suffix <strategy>",
  "Controls how the path of the addon inside a package is transformed into a library name",
)
  .choices(LIBRARY_NAMING_CHOICES)
  .default(NODE_API_PATH_SUFFIX || "strip");
